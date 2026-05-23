import initSqlJs from 'sql.js';
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';
import type { AppDrizzleDb } from '@app/db';

let dbPromise: Promise<AppDrizzleDb> | undefined;

export function getLocalDb(): Promise<AppDrizzleDb> {
  if (dbPromise === undefined) {
    dbPromise = (async () => {
      const { createDrizzleFromSqlJs, migrateDatabaseToLatest } = await import('@app/db');
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
