import type { Database, SqlJsStatic } from 'sql.js';
import { createDrizzleFromSqlJs } from './client.js';
import type { AppDrizzleDb } from './adapter.js';
import {
  migrateDatabaseFromBundled,
  type BundledMigrationFile,
  type BundledMigrationJournal,
} from './bundled-migrations.js';
import { mergeUncommittedProgress } from './merge-uncommitted-progress.js';
import type { PersistedBytesStore } from './persisted-bytes-store.js';

export interface PersistentDatabaseMigrations {
  readonly journal: BundledMigrationJournal;
  readonly files: readonly BundledMigrationFile[];
}

export interface OpenPersistentDatabaseInput {
  readonly store: PersistedBytesStore;
  readonly sqlModule: SqlJsStatic;
  readonly migrations: PersistentDatabaseMigrations;
  /**
   * Called after every write statement, synchronously. Used to schedule a
   * debounced flush so durability never depends on unload callbacks alone.
   */
  readonly onMutation?: () => void;
}

export type FlushResult = { readonly status: 'saved' | 'reloaded' | 'unchanged' };

export interface PersistentDatabase {
  /**
   * Current Drizzle handle. Re-read this property after `syncFromStore()`;
   * a reload replaces the handle and the old one is closed.
   */
  readonly db: AppDrizzleDb;
  /** Current raw handle; same replacement rule as `db`. */
  readonly raw: Database;
  /** True when stored bytes were unreadable and a fresh database was started. */
  readonly quarantinedBytes: boolean;
  /** Persists the current bytes when the store version still matches the loaded one. */
  flush: () => Promise<FlushResult>;
  /** Reloads the working copy from the store, replacing `db`/`raw`. */
  syncFromStore: () => Promise<void>;
  close: () => void;
}

function openFreshDatabase(
  sqlModule: SqlJsStatic,
  migrations: PersistentDatabaseMigrations,
): Database {
  const raw = new sqlModule.Database();
  migrateDatabaseFromBundled(raw, migrations.journal, migrations.files);
  return raw;
}

function tryOpenStoredDatabase(sqlModule: SqlJsStatic, bytes: Uint8Array): Database | null {
  try {
    const raw = new sqlModule.Database(bytes);
    // A readable SQLite file answers a schema query; random bytes do not.
    raw.exec('SELECT name FROM sqlite_master LIMIT 1');
    return raw;
  } catch {
    return null;
  }
}

/**
 * Opens a `sql.js` database backed by a compare-and-swap byte store.
 *
 * The in-memory database is the working copy. `flush` is the durability point:
 * it refuses to overwrite when another writer advanced the store first and
 * reports `reloaded` instead, so callers can rebuild their handles.
 */
export async function openPersistentDatabase(
  input: OpenPersistentDatabaseInput,
): Promise<PersistentDatabase> {
  const { store, sqlModule, migrations, onMutation } = input;

  /**
   * `sql.js` `export()` detaches the update hook and resets `PRAGMA
   * foreign_keys`; every export and every stored-bytes open must re-establish
   * both, or later writes run without FK enforcement and without scheduling
   * durable flushes.
   */
  const enforceConnectionInvariants = (rawDb: Database): void => {
    rawDb.run('PRAGMA foreign_keys = ON');
    if (onMutation !== undefined) {
      rawDb.updateHook(() => {
        onMutation();
      });
    }
  };

  const stored = await store.read();
  let baseVersion = stored?.version ?? 0;
  let quarantinedBytes = false;
  let raw = stored ? tryOpenStoredDatabase(sqlModule, stored.bytes) : null;

  if (stored && raw === null) {
    quarantinedBytes = true;
    await store.clear();
    baseVersion = 0;
  }

  raw ??= openFreshDatabase(sqlModule, migrations);
  enforceConnectionInvariants(raw);
  // Retired handles stay open for one further sync so a fetch that captured the
  // previous handle usually finishes. A consumer that outlives two syncs can
  // still be closed under it: the buffer keeps memory bounded to one generation.
  const retired: Database[] = [];
  let closed = false;
  const session = {
    raw,
    db: createDrizzleFromSqlJs(raw),
    quarantinedBytes,
    flush: async (): Promise<FlushResult> => {
      const bytes = session.raw.export();
      enforceConnectionInvariants(session.raw);
      const committed = await store.write(bytes, baseVersion);
      if (committed !== null) {
        baseVersion = committed.version;
        return { status: 'saved' };
      }
      // Another writer advanced first. Merge the local uncommitted progress rows
      // into its snapshot instead of dropping them, then retry once against the
      // version we just observed.
      const latest = await store.read();
      if (latest === undefined) {
        return { status: 'reloaded' };
      }
      const merged = mergeUncommittedProgress(latest.bytes, session.raw, sqlModule);
      if (merged === null) {
        return { status: 'reloaded' };
      }
      const retried = await store.write(merged, latest.version);
      if (retried === null) {
        return { status: 'reloaded' };
      }
      baseVersion = retried.version;
      return { status: 'reloaded' };
    },
    syncFromStore: async (): Promise<void> => {
      if (closed) return;
      const latest = await store.read();
      // The session may have been closed while `read` was in flight; swapping
      // a fresh handle into it would revive a database nothing owns.
      if (closed) return;
      if (latest === undefined) return;
      // Nothing changed since the last load; re-swapping would retire a handle
      // for no reason and burn the one-generation buffer.
      if (latest.version === baseVersion) return;
      const next = tryOpenStoredDatabase(sqlModule, latest.bytes);
      if (next === null) return;
      enforceConnectionInvariants(next);
      retired.push(session.raw);
      if (retired.length > 1) {
        retired.shift()?.close();
      }
      session.raw = next;
      session.db = createDrizzleFromSqlJs(next);
      baseVersion = latest.version;
    },
    close: () => {
      if (closed) return;
      closed = true;
      session.raw.close();
      for (const handle of retired) {
        handle.close();
      }
      retired.length = 0;
    },
  };

  return session;
}
