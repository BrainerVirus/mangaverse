import { drizzle } from 'drizzle-orm/sql-js';
import type { Database } from 'sql.js';
import * as schema from './schema.js';
import type { AppDrizzleDb } from './adapter.js';
import { registerSqlJsFolds } from './sql-fold.js';

export function createDrizzleFromSqlJs(client: Database): AppDrizzleDb {
  // Registered before any repository query runs; every sql.js path goes through here.
  registerSqlJsFolds(client as unknown as Parameters<typeof registerSqlJsFolds>[0]);
  return drizzle(client, { schema: schema.schema });
}
