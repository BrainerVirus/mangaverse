import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrateDatabaseFromBundled } from './browser.js';
import { migrateDatabaseToLatest } from './node.js';

const migrationsRoot = fileURLToPath(new URL('../migrations', import.meta.url));
const initialSql = readFileSync(`${migrationsRoot}/0000_initial.sql`, 'utf8');
const cacheAssetSql = readFileSync(`${migrationsRoot}/0001_cache_asset_metadata.sql`, 'utf8');
const journal = JSON.parse(readFileSync(`${migrationsRoot}/meta/_journal.json`, 'utf8'));

describe('bundled migrations', () => {
  it('applies the same schema as filesystem migrations', async () => {
    const SQL = await initSqlJs();
    const bundled = new SQL.Database();
    migrateDatabaseFromBundled(bundled, journal, [
      {
        tag: '0000_initial',
        sql: initialSql,
        hash: '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea',
      },
      {
        tag: '0001_cache_asset_metadata',
        sql: cacheAssetSql,
        hash: 'be8c129e37327e353096a7daf815a2963471cbc0429ca76b2b5a2129251fd175',
      },
    ]);

    const fsBacked = new SQL.Database();
    migrateDatabaseToLatest(fsBacked);

    const bundledTables = bundled
      .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .flatMap((result) => result.values.map((row) => row[0]));
    const fsTables = fsBacked
      .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .flatMap((result) => result.values.map((row) => row[0]));

    expect(bundledTables).toEqual(fsTables);
  });
});
