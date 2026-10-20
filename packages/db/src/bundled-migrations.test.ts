import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toProviderId } from '@app/shared';
import { migrateDatabaseFromBundled } from './browser.js';
import { createDrizzleFromSqlJs } from './client.js';
import { migrateDatabaseToLatest } from './node.js';
import { createMangaIdentityWithInitialMapping } from './repositories/identities.js';

const migrationsRoot = fileURLToPath(new URL('../migrations', import.meta.url));
const initialSql = readFileSync(`${migrationsRoot}/0000_initial.sql`, 'utf8');
const cacheAssetSql = readFileSync(`${migrationsRoot}/0001_cache_asset_metadata.sql`, 'utf8');
const themesSql = readFileSync(`${migrationsRoot}/0002_themes.sql`, 'utf8');
const libraryUniqueMangaSql = readFileSync(
  `${migrationsRoot}/0003_library_unique_manga.sql`,
  'utf8',
);
const journal = JSON.parse(readFileSync(`${migrationsRoot}/meta/_journal.json`, 'utf8'));

const migrationFiles = [
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
  {
    tag: '0002_themes',
    sql: themesSql,
    hash: 'b82ae03e19ad700a913d2407db98b5c89dbe24913d764eaa01b116b930f4fdd5',
  },
  {
    tag: '0003_library_unique_manga',
    sql: libraryUniqueMangaSql,
    hash: '438c0cf16e33a1fbd49d724396f8babf64c778498ff3daffbafd76a690fdbf42',
  },
];

function insertLibraryRow(
  raw: Database,
  id: string,
  mangaId: string,
  addedAt: string | null,
): void {
  raw.run(
    `INSERT INTO library_entries
      (id, manga_id, favorite, status, unread_count, added_at, updated_at)
     VALUES (?, ?, 0, 'reading', 0, ?, ?)`,
    [id, mangaId, addedAt, addedAt],
  );
}

function singleValue(raw: Database, sql: string, params: string[] = []): unknown {
  return raw.exec(sql, params)[0]?.values[0]?.[0];
}

function ids(raw: Database, sql: string, params: string[] = []): unknown[] {
  return (raw.exec(sql, params)[0]?.values ?? []).map((row) => row[0]);
}

describe('bundled migrations', () => {
  it('applies the same schema as filesystem migrations', async () => {
    const SQL = await initSqlJs();
    const bundled = new SQL.Database();
    migrateDatabaseFromBundled(bundled, journal, migrationFiles);

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

  it('keeps one library entry per manga before adding the unique index', async () => {
    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    migrateDatabaseFromBundled(
      raw,
      { ...journal, entries: journal.entries.slice(0, 3) },
      migrationFiles.slice(0, 3),
    );

    const db = createDrizzleFromSqlJs(raw);
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Duplicate Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-dup'),
      providerMangaId: 'dup-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const mangaId = created.value.mangaId;

    raw.run("INSERT INTO categories (id, name) VALUES ('c1', 'One'), ('c2', 'Two')");
    // Earliest added_at wins; the second row's category must move to the keeper.
    insertLibraryRow(raw, 'later', mangaId, '2026-01-02T00:00:00.000Z');
    insertLibraryRow(raw, 'earlier', mangaId, '2026-01-01T00:00:00.000Z');
    raw.run("INSERT INTO library_category_memberships VALUES ('later', 'c1'), ('earlier', 'c2')");

    // A tie on added_at is broken by id.
    const tie = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Tie Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-tie'),
      providerMangaId: 'tie-1',
    });
    expect(tie.ok).toBe(true);
    if (!tie.ok) return;
    insertLibraryRow(raw, 'tie-b', tie.value.mangaId, '2026-02-01T00:00:00.000Z');
    insertLibraryRow(raw, 'tie-a', tie.value.mangaId, '2026-02-01T00:00:00.000Z');

    migrateDatabaseFromBundled(raw, journal, migrationFiles);

    expect(ids(raw, 'SELECT id FROM library_entries WHERE manga_id = ?', [mangaId])).toEqual([
      'earlier',
    ]);
    expect(
      ids(raw, 'SELECT id FROM library_entries WHERE manga_id = ?', [tie.value.mangaId]),
    ).toEqual(['tie-a']);
    expect(
      ids(raw, 'SELECT category_id FROM library_category_memberships ORDER BY category_id'),
    ).toEqual(['c1', 'c2']);

    const indexes = raw.exec("PRAGMA index_list('library_entries')")[0]?.values ?? [];
    const indexNames = indexes.map((row) => row[1]);
    expect(indexNames).toContain('library_entries_manga_unique_idx');
    expect(indexNames).not.toContain('library_entries_manga_idx');
    expect(indexes.find((row) => row[1] === 'library_entries_manga_unique_idx')?.[2]).toBe(1);

    expect(() =>
      insertLibraryRow(raw, 'second-entry', mangaId, '2026-03-01T00:00:00.000Z'),
    ).toThrow(/UNIQUE constraint failed: library_entries\.manga_id/);
    expect(singleValue(raw, 'SELECT COUNT(*) FROM library_entries')).toBe(2);
  });
});
