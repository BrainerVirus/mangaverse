import { BetterSQLiteSession } from 'drizzle-orm/better-sqlite3/session';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations';
import { BaseSQLiteDatabase, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { AppDrizzleDb } from '../adapter.js';
import { getMigrationsFolder } from '../migrations-folder.js';
import { schema as appSchema, type AppSchema } from '../schema.js';
import { createTitleFolds } from '../sqlite-functions.js';
import { NodeSqliteClient } from './node-sqlite-client.js';

export interface NativeDatabase {
  readonly db: AppDrizzleDb;
  readonly client: NodeSqliteClient;
  close(): void;
}

/** Durability the host chooses explicitly: driver defaults differ (ADR 0001, Consequences). */
export const NATIVE_PRAGMAS = {
  journal_mode: 'wal',
  foreign_keys: 1,
  synchronous: 1, // NORMAL: WAL keeps commits atomic; a power cut can lose only the last ones.
} as const;

function drizzleOver(client: NodeSqliteClient): AppDrizzleDb {
  const dialect = new SQLiteSyncDialect();
  const tables = extractTablesRelationalConfig(appSchema, createTableRelationsHelpers);
  const schema = {
    fullSchema: appSchema,
    schema: tables.tables,
    tableNamesMap: tables.tableNamesMap,
  };
  // The session only calls prepare/exec/transaction, which the client provides on node:sqlite;
  // `better-sqlite3` itself is never loaded.
  const session = new BetterSQLiteSession(client as never, dialect, schema as never, {});
  return new BaseSQLiteDatabase<'sync', unknown, AppSchema>(
    'sync',
    dialect,
    session as never,
    schema as never,
  );
}

/** Applies the bundled migrations; a rerun applies nothing. */
function migrateNative(db: AppDrizzleDb): void {
  const migrations = readMigrationFiles({ migrationsFolder: getMigrationsFolder() });
  const { dialect, session } = db as unknown as {
    dialect: SQLiteSyncDialect;
    session: Parameters<SQLiteSyncDialect['migrate']>[1];
  };
  dialect.migrate(migrations, session, { migrationsFolder: getMigrationsFolder() });
}

/** Opens (or creates) a native database at `path` with the host PRAGMAs, migrated to latest. */
export function openNativeDatabase(path: string): NativeDatabase {
  const client = new NodeSqliteClient(path);
  client.exec(`PRAGMA journal_mode = ${NATIVE_PRAGMAS.journal_mode}`);
  client.exec(`PRAGMA foreign_keys = ${NATIVE_PRAGMAS.foreign_keys}`);
  client.exec(`PRAGMA synchronous = ${NATIVE_PRAGMAS.synchronous}`);
  for (const [name, fold] of Object.entries(createTitleFolds())) {
    client.database.function(name, { deterministic: true }, fold as never);
  }
  const db = drizzleOver(client);
  migrateNative(db);
  return { db, client, close: () => client.close() };
}
