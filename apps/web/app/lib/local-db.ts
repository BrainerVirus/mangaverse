import type { AppDrizzleDb } from '@app/db/browser';
import type { BundledMigrationJournal } from '@app/db/browser';
import type { SqlJsStatic } from 'sql.js';

let dbPromise: Promise<AppDrizzleDb> | undefined;

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

export function getLocalDb(): Promise<AppDrizzleDb> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Local DB is only available in the browser'));
  }

  if (dbPromise === undefined) {
    dbPromise = (async () => {
      try {
        const [
          sqlModule,
          wasmModule,
          { migrateDatabaseFromBundled, createDrizzleFromSqlJs },
          { default: initialMigrationSql },
          { default: cacheAssetMigrationSql },
          { default: migrationJournal },
        ] = await Promise.all([
          import('sql.js'),
          import('sql.js/dist/sql-wasm.wasm?url'),
          import('@app/db/browser'),
          import('@app/db/migrations/0000_initial.sql?raw'),
          import('@app/db/migrations/0001_cache_asset_metadata.sql?raw'),
          import('@app/db/migrations/meta/_journal.json'),
        ]);

        const initSqlJs = resolveInitSqlJs(sqlModule);
        const sqlWasm = resolveWasmAssetUrl(wasmModule);

        const SQL = await initSqlJs({
          locateFile: () => sqlWasm,
        });
        const raw = new SQL.Database();
        migrateDatabaseFromBundled(raw, migrationJournal as BundledMigrationJournal, [
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
        ]);
        return createDrizzleFromSqlJs(raw);
      } catch (error) {
        dbPromise = undefined;
        throw error;
      }
    })();
  }
  return dbPromise;
}
