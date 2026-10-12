import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import type { Database } from 'sql.js';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

let migrationsFolderCache: string | undefined;

function resolveMigrationsFolder(): string {
  if (migrationsFolderCache === undefined) {
    migrationsFolderCache = fileURLToPath(new URL('../migrations', import.meta.url));
  }
  return migrationsFolderCache;
}

/**
 * Applies bundled SQL migrations to an empty or partially migrated `sql.js` database.
 *
 * Safe to call multiple times; Drizzle records applied migrations in `__drizzle_migrations`.
 */
export function migrateDatabaseToLatest(client: Database): void {
  client.run('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema: schema.schema });
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
}

export function getMigrationsFolder(): string {
  return resolveMigrationsFolder();
}
