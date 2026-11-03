import { drizzle } from 'drizzle-orm/sql-js';
import type { Database } from 'sql.js';
import * as schema from './schema.js';
import type { AppDrizzleDb } from './adapter.js';
import { createTitleFolds } from './sqlite-functions.js';

/** Both drivers register the same functions; repositories may then use them in SQL. */
function registerSqlJsFunctions(client: Database): void {
  for (const [name, fold] of Object.entries(createTitleFolds())) {
    client.create_function(name, fold as (value: unknown) => unknown);
  }
}

export function createDrizzleFromSqlJs(client: Database): AppDrizzleDb {
  registerSqlJsFunctions(client);
  return drizzle(client, { schema: schema.schema });
}
