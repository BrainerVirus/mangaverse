import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrateDatabaseFromBundled } from '@app/db';

const migrationsRoot = fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url));
const initialSql = readFileSync(`${migrationsRoot}/0000_initial.sql`, 'utf8');
const journal = JSON.parse(readFileSync(`${migrationsRoot}/meta/_journal.json`, 'utf8'));

const INITIAL_MIGRATION_HASH =
  '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea';

describe('local-db bundled migration path', () => {
  it('applies the same bundled migration files used by getLocalDb()', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    migrateDatabaseFromBundled(db, journal, [
      {
        tag: '0000_initial',
        sql: initialSql,
        hash: INITIAL_MIGRATION_HASH,
      },
    ]);

    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .flatMap((result) => result.values.map((row) => row[0]));

    expect(tables).toContain('installed_extensions');
    expect(tables).toContain('library_entries');
    expect(tables).toContain('__drizzle_migrations');
  });
});
