import { drizzle } from 'drizzle-orm/sql-js';
import type { Database } from 'sql.js';
import * as schema from './schema.js';
import type { AppDrizzleDb } from './adapter.js';

export function createDrizzleFromSqlJs(client: Database): AppDrizzleDb {
  return drizzle(client, { schema: schema.schema });
}
