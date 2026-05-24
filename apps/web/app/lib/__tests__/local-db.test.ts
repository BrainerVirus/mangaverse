import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { migrateDatabaseFromBundled } from '@app/db/browser';
import { resolveInitSqlJs, resolveWasmAssetUrl } from '../local-db.js';

const INITIAL_MIGRATION_HASH =
  '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea';

function loadBundledMigrationFixtures() {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const migrationsRoot = join(testDir, '../../../../../packages/db/migrations');
  return {
    initialSql: readFileSync(join(migrationsRoot, '0000_initial.sql'), 'utf8'),
    journal: JSON.parse(readFileSync(join(migrationsRoot, 'meta/_journal.json'), 'utf8')),
  };
}

describe('resolveInitSqlJs', () => {
  const initFn = () => Promise.resolve({ Database: class {} });

  it('accepts a default export function (Vite ESM interop)', () => {
    expect(resolveInitSqlJs({ default: initFn })).toBe(initFn);
  });

  it('accepts initSqlJs named export (CJS/legacy interop)', () => {
    expect(resolveInitSqlJs({ initSqlJs: initFn })).toBe(initFn);
  });

  it('accepts a direct function module namespace', () => {
    expect(resolveInitSqlJs(initFn)).toBe(initFn);
  });

  it('accepts nested default export (double CJS interop)', () => {
    expect(resolveInitSqlJs({ default: { default: initFn } })).toBe(initFn);
  });

  it('throws when the module shape is invalid', () => {
    expect(() => resolveInitSqlJs({ default: {} })).toThrow(
      'sql.js dynamic import did not provide initSqlJs',
    );
  });
});

describe('resolveWasmAssetUrl', () => {
  it('returns the default URL from a Vite ?url import', () => {
    expect(resolveWasmAssetUrl({ default: '/assets/sql-wasm.wasm' })).toBe('/assets/sql-wasm.wasm');
  });

  it('throws when WASM URL is missing', () => {
    expect(() => resolveWasmAssetUrl({})).toThrow(
      'sql.js WASM asset import did not provide a URL',
    );
  });
});

describe('local-db bundled migration path', () => {
  it('uses the browser-safe db entry without node:url migration imports', async () => {
    const browser = await import('@app/db/browser');
    expect(typeof browser.migrateDatabaseFromBundled).toBe('function');
    expect(typeof browser.createDrizzleFromSqlJs).toBe('function');
    expect(typeof browser.migrateDatabaseToLatest).toBe('undefined');
  });

  it('applies the same bundled migration files used by getLocalDb()', async () => {
    const { initialSql, journal } = loadBundledMigrationFixtures();
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
