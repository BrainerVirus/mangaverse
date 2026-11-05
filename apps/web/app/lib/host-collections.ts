import {
  createCollection,
  parseLoadSubsetOptions,
  type Collection,
  type LoadSubsetOptions,
} from '@tanstack/db';
import type { DataHostChangeEvent, RowChange } from '@app/db/browser';

// TanStack DB collections fed by the data host (ADR 0001, decision 6). SQLite stays the source
// of truth: a collection loads through the host's procedures, and the change batches the host
// broadcasts after each committed write keep every window's copy current.

export type ChangeFeed = (listener: (event: DataHostChangeEvent) => void) => () => void;

type SyncedTable = RowChange['table'];

const touches = (event: DataHostChangeEvent, tables: ReadonlySet<SyncedTable>) =>
  event.kind === 'resync' || event.changes.some((change) => tables.has(change.table));

/** A row of a list the host orders: the value, and where the host put it. */
export interface ListedRow<T> {
  readonly key: string;
  readonly position: number;
  readonly value: T;
}

interface HostListUtils extends Record<string, () => Promise<void>> {
  /** Loads the list again; resolves once the rows on screen are the host's. */
  refetch(): Promise<void>;
}

export interface HostListOptions<T> {
  readonly id: string;
  /** The whole list, filtered and ordered by the host. */
  readonly load: () => Promise<readonly T[]>;
  readonly keyOf: (value: T) => string;
  /** A committed change to any of these reloads the list, unless it can patch its rows. */
  readonly tables: readonly SyncedTable[];
  readonly subscribe: ChangeFeed;
  /**
   * One row as the host now shows it, or undefined when it does not belong to the list (a
   * bounded list leaves out rows past its end). With `rowTable`, a change to that table reads
   * only the rows it names.
   */
  readonly refreshRow?: (key: string) => Promise<T | undefined>;
  /** One of `tables`, whose change keys are this list's keys. */
  readonly rowTable?: SyncedTable;
  /**
   * False when a change to a row can move it in the host's order, so the list reloads whole.
   * Defaults to true when `refreshRow` is set.
   */
  readonly patchRows?: boolean;
  /**
   * How long a change that needs a whole reload waits before it reloads, so a burst of change
   * batches costs one reload. Defaults to 0: reload at once. `refetch()` never waits, and row
   * patches are not delayed.
   */
  readonly reloadDelayMs?: number;
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
 *
 * With `refreshRow`, a change to `rowTable` alone reads only the rows it names and updates
 * them in place: their position stays the host's from the last reload. A named row that
 * joins or leaves the list reloads it whole: only the host can place it or refill the end.
 *
 * With `reloadDelayMs`, a reload a change asks for starts after that delay, once for every
 * change that arrives meanwhile.
 *
 * Once its last subscriber leaves, the list stops reading the host: a change only marks it
 * stale (the collection's sync outlives its readers until `gcTime`), and the next subscriber
 * reloads it at once. `refetch()` reads whether or not anyone is watching.
 */
export function createHostListCollection<T extends object>(
  options: HostListOptions<T>,
): HostListCollection<T> {
  const { load, keyOf, subscribe, persistUpdate, rowTable } = options;
  const reloadDelayMs = options.reloadDelayMs ?? 0;
  const tables = new Set(options.tables);
  // The row read, when a change to `rowTable` may patch rows instead of reloading.
  const readRow =
    rowTable === undefined || options.patchRows === false ? undefined : options.refreshRow;
  let refetch: () => Promise<void> = () => Promise.resolve();

  return createCollection<ListedRow<T>, string, HostListUtils>({
    id: options.id,
    getKey: (row) => row.key,
    utils: { refetch: () => refetch() },
    sync: {
      rowUpdateMode: 'full',
      sync: ({ begin, write, commit, markReady, fail, reportError, reportHealthy, collection }) => {
        let stopped = false;
        let ready = false;
        let tail: Promise<void> = Promise.resolve();
        let queued: Promise<void> | null = null;
        let queuedPatch: Promise<void> | null = null;
        let patchKeys = new Set<string>();

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
        const report = (error: unknown) => {
          if (stopped) return;
          if (ready) reportError(error);
          else fail(error);
        };

        // A list nobody reads has no reason to read the host: once its last subscriber leaves, a
        // change only marks it stale, and the next subscriber's return reloads it. `idle` stays
        // false until a subscriber has come and gone, so the window where sync has started and
        // the first reader has not yet attached (a preload, a handoff) is never idle.
        let idle = false;
        let stale = false;

        const reload = () => {
          if (queued !== null) return queued;
          const next = tail.then(() => {
            queued = null;
            // Every change that arrived before this point is covered by the read below; one that
            // arrives while idle after it marks the list stale again.
            stale = false;
            return apply().then(undefined, report);
          });
          queued = next;
          tail = next;
          return next;
        };

        // A change-driven reload waits out its burst: the first change starts the timer, the
        // ones after it ride on it, and the reload reads the host once the timer fires.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cancelScheduled = () => {
          if (timer === undefined) return;
          clearTimeout(timer);
          timer = undefined;
        };
        const scheduleReload = () => {
          if (idle) {
            stale = true;
            return;
          }
          if (reloadDelayMs <= 0) {
            void reload();
            return;
          }
          if (timer !== undefined) return;
          timer = setTimeout(() => {
            timer = undefined;
            if (!stopped) void reload();
          }, reloadDelayMs);
        };
        // The reload a refetch starts reads the host now, so a scheduled one has nothing to add.
        refetch = () => {
          cancelScheduled();
          return reload();
        };

        const applyRows = async (
          read: (key: string) => Promise<T | undefined>,
          keys: readonly string[],
        ) => {
          const rows = await Promise.all(
            keys.map(async (key) => ({ key, value: await read(key) })),
          );
          if (stopped) return;
          // A row that joins or leaves the list moves the rows after it, and a bounded list
          // has to be refilled from past its end: only the host can lay that out.
          const reshaped = rows.some(({ key, value }) =>
            collection.has(key) ? value === undefined : value !== undefined,
          );
          if (reshaped) {
            // Not awaited: the reload queues behind this patch.
            scheduleReload();
            return;
          }
          const listed = rows.flatMap(({ key, value }) => {
            const row = collection.get(key);
            return row === undefined || value === undefined
              ? []
              : [{ key, position: row.position, value }];
          });
          if (listed.length === 0) return;
          begin();
          for (const { key, position, value } of listed) {
            write({ type: 'update', value: { key, position, value } });
          }
          // Accepted now and applied in order; while an optimistic edit persists it shows once
          // that settles, and waiting for it would hold the queue the edit's own refetch is on.
          void commit();
        };

        // Patches share the reloads' queue, so a row read never lands under an older snapshot.
        // A reload that has not started yet reads after the change: it brings the rows in.
        const patch = (read: (key: string) => Promise<T | undefined>, keys: readonly string[]) => {
          if (idle) {
            stale = true;
            return Promise.resolve();
          }
          if (queued !== null) return queued;
          for (const key of keys) patchKeys.add(key);
          if (queuedPatch !== null) return queuedPatch;
          const next = tail.then(() => {
            queuedPatch = null;
            const batch = [...patchKeys];
            patchKeys = new Set();
            return applyRows(read, batch).then(undefined, report);
          });
          queuedPatch = next;
          tail = next;
          return next;
        };

        const unsubscribe = subscribe((event) => {
          if (!touches(event, tables)) return;
          const changes = event.kind === 'resync' ? [] : event.changes;
          const rowsOnly =
            changes.length > 0 &&
            changes.every((change) => change.table === rowTable || !tables.has(change.table));
          if (readRow !== undefined && rowsOnly) {
            const rows = changes.filter((change) => change.table === rowTable);
            void patch(
              readRow,
              rows.map((change) => change.key),
            );
          } else scheduleReload();
        });
        const unsubscribeReaders = collection.on(
          'subscribers:change',
          ({ subscriberCount, previousSubscriberCount }) => {
            if (subscriberCount > 0) {
              if (!idle) return;
              idle = false;
              // A returning reader, not a burst: no delay. A reload still queued reads after
              // the change; one running started before it, so reload() queues another.
              if (stale) void reload();
            } else if (previousSubscriberCount > 0 && !idle) {
              idle = true;
              // A reload that was waiting out its burst is owed, not dropped.
              if (timer !== undefined) {
                cancelScheduled();
                stale = true;
              }
            }
          },
        );
        void reload();
        return () => {
          stopped = true;
          cancelScheduled();
          unsubscribeReaders();
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
class UnboundedLoadError extends Error {
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
