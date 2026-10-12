import type { AppDrizzleDb } from '@app/db/browser';
import type { BundledMigrationJournal } from '@app/db/browser';
import type { PersistentDatabase } from '@app/db/browser';
import type { SqlJsStatic } from 'sql.js';

let dbPromise: Promise<PersistentDatabase> | undefined;
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
  dbPromise = undefined;
}

/** Opens (or returns) the durable local database session. */
export function getLocalDbSession(): Promise<PersistentDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Local DB is only available in the browser'));
  }

  if (dbPromise === undefined) {
    dbPromise = (async () => {
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
        dbPromise = undefined;
        throw error;
      }
    })();
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
    try {
      if (dbPromise === undefined) return;
      const session = await dbPromise;
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
    } finally {
      pendingFlush = null;
    }
  })();
  await pendingFlush;
}

/**
 * Re-syncs the in-memory database after another tab committed a snapshot.
 * Returns true when the working copy was replaced and callers should refetch.
 */
export async function syncLocalDbFromOtherTab(): Promise<boolean> {
  if (dbPromise === undefined) return false;
  const session = await dbPromise;
  await session.syncFromStore();
  return true;
}

/** Invokes `onExternalChange` when another tab commits a snapshot. */
export function watchLocalDbForExternalChanges(onExternalChange: () => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key !== SYNC_NOTIFY_KEY) return;
    void syncLocalDbFromOtherTab().then((changed) => {
      if (changed) onExternalChange();
    });
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
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
