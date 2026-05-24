import type { AppDrizzleDb } from '@app/db';
import type { BundledMigrationJournal } from '@app/db';

let dbPromise: Promise<AppDrizzleDb> | undefined;

const INITIAL_MIGRATION_HASH =
  '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea';

export function getLocalDb(): Promise<AppDrizzleDb> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Local DB is only available in the browser'));
  }

  if (dbPromise === undefined) {
    dbPromise = (async () => {
      const [
        { default: initSqlJs },
        { default: sqlWasm },
        { migrateDatabaseFromBundled, createDrizzleFromSqlJs },
        { default: initialMigrationSql },
        { default: migrationJournal },
      ] = await Promise.all([
        import('sql.js'),
        import('sql.js/dist/sql-wasm.wasm?url'),
        import('@app/db'),
        import('@app/db/migrations/0000_initial.sql?raw'),
        import('@app/db/migrations/meta/_journal.json'),
      ]);

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
      ]);
      return createDrizzleFromSqlJs(raw);
    })();
  }
  return dbPromise;
}
