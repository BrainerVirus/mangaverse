import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import type { Database } from 'sql.js';
import { getMigrationsFolder } from './migrations-folder.js';
import * as schema from './schema.js';
import { registerSqlJsFolds } from './sql-fold.js';

/**
 * Applies bundled SQL migrations to an empty or partially migrated `sql.js` database.
 *
 * Safe to call multiple times; Drizzle records applied migrations in `__drizzle_migrations`.
 */
export function migrateDatabaseToLatest(client: Database): void {
  client.run('PRAGMA foreign_keys = ON');
  // Registered here too: this connection outlives the migrator if a caller keeps it.
  registerSqlJsFolds(client as unknown as Parameters<typeof registerSqlJsFolds>[0]);
  const db = drizzle(client, { schema: schema.schema });
  migrate(db, { migrationsFolder: getMigrationsFolder() });
}

export { getMigrationsFolder };
