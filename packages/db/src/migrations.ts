import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import type { Database } from 'sql.js';
import { getMigrationsFolder } from './migrations-folder.js';
import * as schema from './schema.js';

/**
 * Applies bundled SQL migrations to an empty or partially migrated `sql.js` database.
 *
 * Safe to call multiple times; Drizzle records applied migrations in `__drizzle_migrations`.
 */
export function migrateDatabaseToLatest(client: Database): void {
  client.run('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema: schema.schema });
  migrate(db, { migrationsFolder: getMigrationsFolder() });
}

export { getMigrationsFolder };
