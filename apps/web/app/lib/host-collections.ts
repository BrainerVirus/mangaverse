import {
  createCollection,
  parseLoadSubsetOptions,
  type Collection,
  type LoadSubsetOptions,
} from '@tanstack/react-db';
import type { DataHostChangeEvent, RowChange } from '@app/db/browser';

// TanStack DB collections fed by the data host (ADR 0001, decision 6). SQLite stays the source
// of truth: a collection loads through the host's procedures, and the change batches the host
// broadcasts after each committed write keep every window's copy current.

export type ChangeFeed = (listener: (event: DataHostChangeEvent) => void) => () => void;

type SyncedTable = RowChange['table'];

const touches = (event: DataHostChangeEvent, tables: readonly SyncedTable[]) =>
  event.kind === 'resync' || event.changes.some((change) => tables.includes(change.table));

/** A row of a list the host orders: the value, and where the host put it. */
export interface ListedRow<T> {
  readonly key: string;
  readonly position: number;
  readonly value: T;
}

export interface HostListUtils extends Record<string, () => Promise<void>> {
  /** Loads the list again; resolves once the rows on screen are the host's. */
  refetch(): Promise<void>;
}

export interface HostListOptions<T> {
  readonly id: string;
  /** The whole list, filtered and ordered by the host. */
  readonly load: () => Promise<readonly T[]>;
  readonly keyOf: (value: T) => string;
  /** A committed change to any of these reloads the list. */
  readonly tables: readonly SyncedTable[];
  readonly subscribe: ChangeFeed;
  /**
   * Writes an optimistic update to the host. Throwing rolls the optimistic rows back; the
   * error reaches the caller through the transaction.
   */
  readonly persistUpdate?: (
    updates: readonly { readonly original: ListedRow<T>; readonly modified: ListedRow<T> }[],
  ) => Promise<void>;
}

export type HostListCollection<T> = Collection<ListedRow<T>, string, HostListUtils>;

/**
 * A list whose filter and order belong to the host, so a relevant change reloads it whole and
 * replaces the rows as one snapshot. Reloads run one at a time; a burst of changes while one
 * runs costs one more, which starts after the write that asked for it.
 */
export function createHostListCollection<T extends object>(
  options: HostListOptions<T>,
): HostListCollection<T> {
  const { load, keyOf, tables, subscribe, persistUpdate } = options;
  let refetch: () => Promise<void> = () => Promise.resolve();

  return createCollection<ListedRow<T>, string, HostListUtils>({
    id: options.id,
    getKey: (row) => row.key,
    utils: { refetch: () => refetch() },
    sync: {
      rowUpdateMode: 'full',
      sync: ({ begin, write, commit, markReady, fail, reportError, reportHealthy }) => {
        let stopped = false;
        let ready = false;
        let tail: Promise<void> = Promise.resolve();
        let queued: Promise<void> | null = null;

        const apply = async () => {
          const values = await load();
          if (stopped) return;
          begin({ snapshot: true });
          values.forEach((value, position) =>
            write({ type: 'insert', value: { key: keyOf(value), position, value } }),
          );
          await commit();
          if (ready) reportHealthy();
          else {
            ready = true;
            markReady();
          }
        };

        // A failed reload keeps the rows on screen and is reported on the collection; it never
        // rejects, so a write that committed is not rolled back because the reload after it failed.
        const reload = () => {
          if (queued !== null) return queued;
          const next = tail.then(() => {
            queued = null;
            return apply().then(undefined, (error: unknown) => {
              if (stopped) return;
              if (ready) reportError(error);
              else fail(error);
            });
          });
          queued = next;
          tail = next;
          return next;
        };
        refetch = reload;

        const unsubscribe = subscribe((event) => {
          if (touches(event, tables)) void reload();
        });
        void reload();
        return () => {
          stopped = true;
          unsubscribe();
        };
      },
    },
    ...(persistUpdate === undefined
      ? {}
      : {
          onUpdate: async ({ transaction }) => {
            await persistUpdate(
              transaction.mutations.map(({ original, modified }) => ({ original, modified })),
            );
            // The optimistic rows stay until the host's rows are in: no flicker back.
            await refetch();
          },
        }),
  });
}

export interface WindowedOptions<T> {
  readonly id: string;
  /** The column a window is ordered by, and the field that names its parent. */
  readonly orderField: keyof T & string;
  readonly parentField: keyof T & string;
  readonly maxWindow: number;
  readonly keyOf: (value: T) => string;
  readonly loadWindow: (request: {
    readonly parent: string;
    readonly limit: number;
    readonly after?: number;
    readonly exact?: number;
  }) => Promise<readonly T[]>;
  readonly loadKeys: (keys: readonly string[]) => Promise<readonly T[]>;
  readonly table: SyncedTable;
  readonly subscribe: ChangeFeed;
}

/** Thrown, as a typed refusal, for a load that names no parent or no bound. */
export class UnboundedLoadError extends Error {
  readonly code = 'data-host.unbounded_load';
  constructor(message: string) {
    super(message);
    this.name = 'UnboundedLoadError';
  }
}

function comparisonValue(
  expression: LoadSubsetOptions['where'],
  field: string,
): { operator: string; value: unknown } | undefined {
  if (expression === undefined) return undefined;
  const match = parseLoadSubsetOptions({ where: expression }).filters.find(
    (filter) => filter.field.join('.') === field,
  );
  return match === undefined ? undefined : { operator: match.operator, value: match.value };
}

/**
 * An on-demand collection for a table too large to hold whole: a live query loads one bounded,
 * ordered window of one parent at a time. A query that names no parent, or asks for no bound,
 * is refused here, and the host refuses an unbounded window on its own as well.
 */
export function createWindowedCollection<T extends object>(
  options: WindowedOptions<T>,
): Collection<T, string> {
  const { orderField, parentField, maxWindow, keyOf, loadWindow, loadKeys, table, subscribe } =
    options;

  return createCollection<T, string>({
    id: options.id,
    getKey: keyOf,
    syncMode: 'on-demand',
    sync: {
      rowUpdateMode: 'full',
      sync: ({
        begin,
        write,
        commit,
        markReady,
        reportError,
        collection,
        invalidateLoadedSubsets,
      }) => {
        let stopped = false;
        const unsubscribe = subscribe((event) => {
          if (event.kind === 'resync') {
            invalidateLoadedSubsets();
            return;
          }
          const changed = event.changes.filter((change) => change.table === table);
          if (changed.length === 0) return;
          const held = changed.filter(
            (change) => change.op !== 'delete' && collection.has(change.key),
          );
          const reshaped = changed.some(
            (change) => change.op === 'delete' || !collection.has(change.key),
          );
          void loadKeys(held.map((change) => change.key)).then(
            async (rows) => {
              if (stopped) return;
              begin();
              for (const change of changed) {
                if (change.op === 'delete' && collection.has(change.key)) {
                  write({ type: 'delete', key: change.key });
                }
              }
              for (const row of rows) write({ type: 'update', value: row });
              await commit();
              // A new or removed row may move a window's edge: queries load their window again.
              if (reshaped) invalidateLoadedSubsets();
            },
            (error: unknown) => {
              if (!stopped) reportError(error);
            },
          );
        });
        markReady();
        return {
          cleanup: () => {
            stopped = true;
            unsubscribe();
          },
          loadSubset: async (subset) => {
            const parent = comparisonValue(subset.where, parentField);
            if (parent?.operator !== 'eq' || typeof parent.value !== 'string') {
              throw new UnboundedLoadError(`A ${table} window loads one ${parentField} at a time.`);
            }
            const exact =
              comparisonValue(subset.where, orderField) ??
              comparisonValue(subset.cursor?.whereCurrent, orderField);
            const from = comparisonValue(subset.cursor?.whereFrom, orderField);
            const isExact = exact?.operator === 'eq' && typeof exact.value === 'number';
            if (!isExact && (subset.limit === undefined || subset.limit > maxWindow)) {
              throw new UnboundedLoadError(`A ${table} window needs a limit up to ${maxWindow}.`);
            }
            const rows = await loadWindow({
              parent: parent.value,
              limit: Math.min(subset.limit ?? maxWindow, maxWindow),
              ...(isExact ? { exact: exact.value as number } : {}),
              ...(from?.operator === 'gt' && typeof from.value === 'number'
                ? { after: from.value }
                : {}),
            });
            if (stopped) return;
            begin();
            for (const row of rows) {
              write(
                collection.has(keyOf(row))
                  ? { type: 'update', value: row }
                  : { type: 'insert', value: row },
              );
            }
            await commit();
          },
        };
      },
    },
  });
}
