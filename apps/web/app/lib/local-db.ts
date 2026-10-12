import type { AppDrizzleDb } from '@app/db/browser';
import type { BundledMigrationJournal } from '@app/db/browser';
import type { PersistentDatabase } from '@app/db/browser';
import type { SqlJsStatic } from 'sql.js';

let dbPromise: Promise<PersistentDatabase> | undefined;
let generation = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const INITIAL_MIGRATION_HASH =
  '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea';

const CACHE_ASSET_MIGRATION_HASH =
  'be8c129e37327e353096a7daf815a2963471cbc0429ca76b2b5a2129251fd175';

type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;

export type SqlJsDynamicModule = {
  default?: unknown;
  initSqlJs?: unknown;
};

/** Resolves initSqlJs across ESM/CJS/Vite dynamic-import interop shapes. */
export function resolveInitSqlJs(sqlModule: SqlJsDynamicModule | InitSqlJs): InitSqlJs {
  const unwrap = (value: unknown, depth = 0): unknown => {
    if (depth > 4) return value;
    if (typeof value === 'function') return value;
    if (!value || typeof value !== 'object') return value;

    const record = value as SqlJsDynamicModule;
    if (typeof record.initSqlJs === 'function') return record.initSqlJs;

    const nestedDefault = record.default;
    if (typeof nestedDefault === 'function') return nestedDefault;
    if (nestedDefault && typeof nestedDefault === 'object') {
      return unwrap(nestedDefault, depth + 1);
    }

    return value;
  };

  const candidate = unwrap(typeof sqlModule === 'function' ? sqlModule : sqlModule);

  if (typeof candidate !== 'function') {
    throw new Error('sql.js dynamic import did not provide initSqlJs');
  }

  return candidate as InitSqlJs;
}

export function resolveWasmAssetUrl(wasmModule: { default?: unknown }): string {
  const url = wasmModule.default;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('sql.js WASM asset import did not provide a URL');
  }
  return url;
}

export function resetLocalDb(): void {
  const session = dbPromise;
  dbPromise = undefined;
  generation += 1;
  if (session !== undefined) {
    // Close the WASM database so retries do not leak memory.
    void session.then((handle) => handle.close()).catch(() => {});
  }
}

/** Opens (or returns) the durable local database session. */
export function getLocalDbSession(): Promise<PersistentDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Local DB is only available in the browser'));
  }

  if (dbPromise === undefined) {
    const holder: { current?: Promise<PersistentDatabase> } = {};
    const attempt = (async () => {
      try {
        const [
          sqlModule,
          wasmModule,
          { openPersistentDatabase },
          { default: initialMigrationSql },
          { default: cacheAssetMigrationSql },
          { default: migrationJournal },
          { createIndexedDbPersistedBytesStore },
        ] = await Promise.all([
          import('sql.js'),
          import('sql.js/dist/sql-wasm.wasm?url'),
          import('@app/db/browser'),
          import('@app/db/migrations/0000_initial.sql?raw'),
          import('@app/db/migrations/0001_cache_asset_metadata.sql?raw'),
          import('@app/db/migrations/meta/_journal.json'),
          import('./persisted-bytes-idb.js'),
        ]);

        const initSqlJs = resolveInitSqlJs(sqlModule);
        const sqlWasm = resolveWasmAssetUrl(wasmModule);

        const SQL = await initSqlJs({
          locateFile: () => sqlWasm,
        });

        return openPersistentDatabase({
          sqlModule: SQL,
          store: createIndexedDbPersistedBytesStore(),
          // Coalesced snapshot writes after every mutation; unload is a fallback,
          // not the only durability point.
          onMutation: () => scheduleLocalDbFlush(),
          migrations: {
            journal: migrationJournal as BundledMigrationJournal,
            files: [
              {
                tag: '0000_initial',
                sql: initialMigrationSql,
                hash: INITIAL_MIGRATION_HASH,
              },
              {
                tag: '0001_cache_asset_metadata',
                sql: cacheAssetMigrationSql,
                hash: CACHE_ASSET_MIGRATION_HASH,
              },
            ],
          },
        });
      } catch (error) {
        // Only clear the slot when this attempt is still the current one; a
        // retry that created a newer promise must not be clobbered.
        if (dbPromise === holder.current) {
          dbPromise = undefined;
        }
        throw error;
      }
    })();
    holder.current = attempt;
    dbPromise = attempt;
  }
  return dbPromise;
}

/** Convenience accessor for callers that only need the Drizzle handle. */
export async function getLocalDb(): Promise<AppDrizzleDb> {
  const session = await getLocalDbSession();
  return session.db;
}

let pendingFlush: Promise<void> | null = null;

const SYNC_NOTIFY_KEY = 'mangaverse.local-db.version';

/** Durability point; awaits the storage transaction before returning. */
export async function flushLocalDb(): Promise<void> {
  if (pendingFlush !== null) {
    await pendingFlush;
    return;
  }
  pendingFlush = (async () => {
    const openedAt = generation;
    try {
      if (dbPromise === undefined) return;
      const session = await dbPromise;
      // A reset while this flush awaited replaces the session; skip the stale one.
      if (openedAt !== generation) return;
      const result = await session.flush();
      if (result.status === 'reloaded') {
        await session.syncFromStore();
      } else if (result.status === 'saved') {
        // Ping other tabs; storage events do not fire in the writing tab.
        try {
          localStorage.setItem(SYNC_NOTIFY_KEY, String(Date.now()));
        } catch {
          // A blocked storage notification must not fail the committed write.
        }
      }
    } catch (error) {
      // Never leave a rejected promise unobserved; quota and denial errors are
      // surfaced here until the UI error-state wiring lands.
      console.error('[local-db] Failed to persist database snapshot:', error);
    } finally {
      pendingFlush = null;
    }
  })();
  await pendingFlush;
}

/**
 * Re-syncs the in-memory database after another tab committed a snapshot.
 * Returns the fresh handle, or null when there is nothing to sync. Callers
 * must replace any handle they were holding; the previous one stays usable for
 * one further sync generation (see openPersistentDatabase).
 */
export async function syncLocalDbFromOtherTab(): Promise<AppDrizzleDb | null> {
  if (dbPromise === undefined) return null;
  const openedAt = generation;
  const session = await dbPromise;
  // A reset while this sync awaited closes the session; reviving it would leak
  // a live handle nothing owns.
  if (openedAt !== generation) return null;
  await session.syncFromStore();
  return session.db;
}

/** Invokes `onExternalChange` when another tab commits a snapshot. */
export function watchLocalDbForExternalChanges(onExternalChange: (db: AppDrizzleDb) => void): () => void {
  // Retired handles stay open for one generation (see openPersistentDatabase),
  // so syncing while hidden cannot break an in-flight query.
  const trySync = () => {
    void syncLocalDbFromOtherTab()
      .then((handle) => {
        if (handle !== null) onExternalChange(handle);
      })
      .catch((error: unknown) => {
        // A rejected store read must not become an unhandled rejection.
        console.error('[local-db] Cross-tab sync failed:', error);
      });
  };
  const storageListener = (event: StorageEvent) => {
    if (event.key === SYNC_NOTIFY_KEY) trySync();
  };
  const visibilityListener = () => {
    if (document.visibilityState === 'visible') trySync();
  };
  window.addEventListener('storage', storageListener);
  document.addEventListener('visibilitychange', visibilityListener);
  return () => {
    window.removeEventListener('storage', storageListener);
    document.removeEventListener('visibilitychange', visibilityListener);
  };
}

/** Coalesces bursts of mutations into one snapshot write. */
export function scheduleLocalDbFlush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLocalDb();
  }, 400);
}
