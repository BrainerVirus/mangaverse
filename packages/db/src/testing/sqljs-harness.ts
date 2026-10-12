import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { createDrizzleFromSqlJs } from '../client.js';
import type { AppDrizzleDb } from '../adapter.js';
import { migrateDatabaseToLatest } from '../node.js';

export interface SqlJsHarness {
  readonly raw: Database;
  readonly db: AppDrizzleDb;
}

/**
 * Opens an in-memory `sql.js` database, applies migrations, and returns a Drizzle handle.
 */
export async function createSqlJsHarness(): Promise<SqlJsHarness> {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  raw.run('PRAGMA foreign_keys = ON');
  migrateDatabaseToLatest(raw);
  const db = createDrizzleFromSqlJs(raw);
  return { raw, db };
}
