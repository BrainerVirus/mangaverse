import type { AppDrizzleDb } from '@app/db';

let dbPromise: Promise<AppDrizzleDb> | undefined;

export function getLocalDb(): Promise<AppDrizzleDb> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Local DB is only available in the browser'));
  }

  if (dbPromise === undefined) {
    dbPromise = (async () => {
      const [{ default: initSqlJs }, { default: sqlWasm }, db] = await Promise.all([
        import('sql.js'),
        import('sql.js/dist/sql-wasm.wasm?url'),
        import('@app/db'),
      ]);
      const { createDrizzleFromSqlJs, migrateDatabaseToLatest } = db;
      const SQL = await initSqlJs({
        locateFile: () => sqlWasm,
      });
      const raw = new SQL.Database();
      raw.run('PRAGMA foreign_keys = ON');
      migrateDatabaseToLatest(raw);
      return createDrizzleFromSqlJs(raw);
    })();
  }
  return dbPromise;
}
