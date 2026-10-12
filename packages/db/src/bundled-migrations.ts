import type { Database } from 'sql.js';

export interface BundledMigrationJournalEntry {
  readonly idx: number;
  readonly version: string;
  readonly when: number;
  readonly tag: string;
  readonly breakpoints: boolean;
}

export interface BundledMigrationJournal {
  readonly version: string;
  readonly dialect: string;
  readonly entries: readonly BundledMigrationJournalEntry[];
}

export interface BundledMigrationFile {
  readonly tag: string;
  readonly sql: string;
  readonly hash: string;
}

function migrationAlreadyApplied(client: Database, hash: string): boolean {
  const tables = client.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
  );
  if (tables.length === 0 || (tables[0]?.values.length ?? 0) === 0) {
    return false;
  }

  const applied = client.exec(`SELECT hash FROM __drizzle_migrations WHERE hash = '${hash}'`);
  return (applied[0]?.values.length ?? 0) > 0;
}

function ensureMigrationTable(client: Database): void {
  client.run(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
}

function runBundledStatements(client: Database, sql: string): void {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) {
      client.run(trimmed);
    }
  }
}

function recordMigration(client: Database, hash: string, createdAt: number): void {
  client.run('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)', [
    hash,
    createdAt,
  ]);
}

/**
 * Parses Drizzle SQL migration files into executable statements.
 * Safe for browser/Electron renderer contexts where Node fs is unavailable.
 */
export function parseBundledMigrationFiles(
  journal: BundledMigrationJournal,
  files: readonly BundledMigrationFile[],
): BundledMigrationFile[] {
  const byTag = new Map(files.map((file) => [file.tag, file]));

  return journal.entries.map((entry) => {
    const file = byTag.get(entry.tag);
    if (!file) {
      throw new Error(`Missing bundled migration SQL for tag "${entry.tag}"`);
    }
    return file;
  });
}

/**
 * Applies bundled SQL migrations to a `sql.js` database without reading from disk.
 */
export function migrateDatabaseFromBundled(
  client: Database,
  journal: BundledMigrationJournal,
  files: readonly BundledMigrationFile[],
): void {
  client.run('PRAGMA foreign_keys = ON');
  ensureMigrationTable(client);

  const migrations = parseBundledMigrationFiles(journal, files);
  for (const [index, migration] of migrations.entries()) {
    if (migrationAlreadyApplied(client, migration.hash)) {
      continue;
    }

    runBundledStatements(client, migration.sql);
    const journalEntry = journal.entries[index];
    recordMigration(client, migration.hash, journalEntry?.when ?? Date.now());
  }
}
