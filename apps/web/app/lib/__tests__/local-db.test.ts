import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { migrateDatabaseFromBundled } from '@app/db/browser';
import { resolveInitSqlJs, resolveWasmAssetUrl } from '../local-db.js';

const INITIAL_MIGRATION_HASH = '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea';

const CACHE_ASSET_MIGRATION_HASH =
  'be8c129e37327e353096a7daf815a2963471cbc0429ca76b2b5a2129251fd175';

const THEMES_MIGRATION_HASH = 'b82ae03e19ad700a913d2407db98b5c89dbe24913d764eaa01b116b930f4fdd5';

const LIBRARY_UNIQUE_MANGA_MIGRATION_HASH =
  '438c0cf16e33a1fbd49d724396f8babf64c778498ff3daffbafd76a690fdbf42';

const MIGRATION_HISTORY_UNDO_MIGRATION_HASH =
  'bd23ab297e509cdcf4fd4ed91bb7cebb3a4236549257c507bb6d103cf9a7f6ef';
const LIBRARY_CATEGORY_PINNED_MIGRATION_HASH =
  'f88fba5bb7715abf811036f0da8d3a895956819fc07782392454640c3ae755b9';
const INSTALLED_EXTENSION_MANIFEST_URL_MIGRATION_HASH =
  'bd9dd7619965a6b2a7d88a59d84e65b58f179683c738edcf676703a04047f6fc';

function loadBundledMigrationFixtures() {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const migrationsRoot = join(testDir, '../../../../../packages/db/migrations');
  return {
    initialSql: readFileSync(join(migrationsRoot, '0000_initial.sql'), 'utf8'),
    cacheAssetSql: readFileSync(join(migrationsRoot, '0001_cache_asset_metadata.sql'), 'utf8'),
    themesSql: readFileSync(join(migrationsRoot, '0002_themes.sql'), 'utf8'),
    libraryUniqueMangaSql: readFileSync(
      join(migrationsRoot, '0003_library_unique_manga.sql'),
      'utf8',
    ),
    migrationHistoryUndoSql: readFileSync(
      join(migrationsRoot, '0004_migration_history_undo.sql'),
      'utf8',
    ),
    libraryCategoryPinnedSql: readFileSync(
      join(migrationsRoot, '0005_library_category_pinned.sql'),
      'utf8',
    ),
    installedExtensionManifestUrlSql: readFileSync(
      join(migrationsRoot, '0006_installed_extension_manifest_url.sql'),
      'utf8',
    ),
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
    expect(() => resolveWasmAssetUrl({})).toThrow('sql.js WASM asset import did not provide a URL');
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
    const {
      initialSql,
      cacheAssetSql,
      themesSql,
      libraryUniqueMangaSql,
      migrationHistoryUndoSql,
      libraryCategoryPinnedSql,
      installedExtensionManifestUrlSql,
      journal,
    } = loadBundledMigrationFixtures();
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    migrateDatabaseFromBundled(db, journal, [
      {
        tag: '0000_initial',
        sql: initialSql,
        hash: INITIAL_MIGRATION_HASH,
      },
      {
        tag: '0001_cache_asset_metadata',
        sql: cacheAssetSql,
        hash: CACHE_ASSET_MIGRATION_HASH,
      },
      {
        tag: '0002_themes',
        sql: themesSql,
        hash: THEMES_MIGRATION_HASH,
      },
      {
        tag: '0003_library_unique_manga',
        sql: libraryUniqueMangaSql,
        hash: LIBRARY_UNIQUE_MANGA_MIGRATION_HASH,
      },
      {
        tag: '0004_migration_history_undo',
        sql: migrationHistoryUndoSql,
        hash: MIGRATION_HISTORY_UNDO_MIGRATION_HASH,
      },
      {
        tag: '0005_library_category_pinned',
        sql: libraryCategoryPinnedSql,
        hash: LIBRARY_CATEGORY_PINNED_MIGRATION_HASH,
      },
      {
        tag: '0006_installed_extension_manifest_url',
        sql: installedExtensionManifestUrlSql,
        hash: INSTALLED_EXTENSION_MANIFEST_URL_MIGRATION_HASH,
      },
    ]);

    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .flatMap((result) => result.values.map((row) => row[0]));

    expect(tables).toContain('installed_extensions');
    expect(tables).toContain('library_entries');
    expect(tables).toContain('themes');
    expect(tables).toContain('__drizzle_migrations');
  });
});
