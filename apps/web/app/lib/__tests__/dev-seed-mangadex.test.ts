import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createDrizzleFromSqlJs, listInstalledExtensions, migrateDatabaseFromBundled } from '@app/db/browser';
import { seedDevMangaDexProvider } from '../dev-seed-mangadex.js';

const INITIAL_MIGRATION_HASH =
  '975ad6e194cffda2f81ec7effd5535768834630dc7df0145821e717bb5b624ea';

function loadBundledMigrationFixtures() {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const migrationsRoot = join(testDir, '../../../../../packages/db/migrations');
  const manifestTemplate = join(testDir, '../../../../../scripts/mangadex-dev/manifest.template.json');
  return {
    initialSql: readFileSync(join(migrationsRoot, '0000_initial.sql'), 'utf8'),
    journal: JSON.parse(readFileSync(join(migrationsRoot, 'meta/_journal.json'), 'utf8')),
    manifest: JSON.parse(readFileSync(manifestTemplate, 'utf8')),
  };
}

describe('seedDevMangaDexProvider', () => {
  it('registers MangaDex after bundled migrations when manifest is available', async () => {
    const { initialSql, journal, manifest } = loadBundledMigrationFixtures();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => manifest,
    })));
    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    migrateDatabaseFromBundled(raw, journal, [
      {
        tag: '0000_initial',
        sql: initialSql,
        hash: INITIAL_MIGRATION_HASH,
      },
    ]);
    const db = createDrizzleFromSqlJs(raw);

    await seedDevMangaDexProvider(db);

    const providers = await listInstalledExtensions(db);
    expect(providers.some((provider) => provider.manifest.id === 'mangadex')).toBe(true);
  });
});
