import { describe, expect, it } from 'vitest';
import { toCategoryId, toLibraryEntryId, toProviderId } from '@app/shared';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { createMangaIdentityWithInitialMapping } from './identities.js';
import { addLibraryEntry, listLibraryEntries } from './library.js';

async function createManga(
  db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'],
  providerMangaId: string,
) {
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: `Manga ${providerMangaId}`,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-race'),
    providerMangaId,
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.mangaId;
}

describe('addLibraryEntry', () => {
  it('Given 32767 library entries, When listing and filtering, Then memberships survive chunk boundaries without duplicate entries', async () => {
    const { db, raw } = await createSqlJsHarness();
    raw.run(`
      WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x < 32766)
      INSERT INTO manga_identities (id, canonical_title, status, content_rating, merged, default_provider_mapping_id)
      SELECT 'm-'||x, 'Series '||x, 'ongoing', 'safe', 0, 'mapping-'||x FROM n;
      INSERT INTO library_entries (id, manga_id, favorite, status, unread_count, added_at)
      SELECT id, id, 0, 'reading', 0, id FROM manga_identities;
      INSERT INTO categories (id, name) VALUES ('category', 'Category');
      INSERT INTO library_category_memberships (library_entry_id, category_id)
      SELECT id, 'category' FROM library_entries;
    `);
    const all = await listLibraryEntries(db, { sort: { key: 'date_added', direction: 'asc' } });
    expect(all).toHaveLength(32767);
    expect(all[0]?.id).toBe('m-0');
    expect(all[500]?.categoryIds).toEqual(['category']);
    expect(all.at(-1)?.categoryIds).toEqual(['category']);
    const categoryIds = Array.from({ length: 32767 }, (_, index) =>
      toCategoryId(`missing-${index}`),
    );
    categoryIds[500] = toCategoryId('category');
    const filtered = await listLibraryEntries(db, {
      filter: { categoryIds: [...categoryIds, toCategoryId('category')] },
      sort: { key: 'date_added', direction: 'asc' },
    });
    expect(filtered.map((entry) => entry.id)).toEqual(all.map((entry) => entry.id));
    raw.close();
  });
  it('adds once and rejects a duplicate manga', async () => {
    const { db } = await createSqlJsHarness();
    const mangaId = await createManga(db, 'plain');

    const first = await addLibraryEntry(db, { mangaId, status: 'reading' });
    expect(first.ok).toBe(true);

    const second = await addLibraryEntry(db, { mangaId, status: 'reading' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('db.library.duplicate');
    expect(second.error.message).toBe('Manga is already in the library.');
    expect(await listLibraryEntries(db)).toHaveLength(1);
  });

  it('persists an explicit id instead of generating one', async () => {
    const { db } = await createSqlJsHarness();
    const mangaId = await createManga(db, 'explicit-id');
    const id = toLibraryEntryId('entry-explicit');

    const result = await addLibraryEntry(db, { mangaId, status: 'reading', id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(id);

    expect((await listLibraryEntries(db)).map((entry) => entry.id)).toEqual([id]);
  });

  it('maps a concurrent insert that lands after the pre-check', async () => {
    const { db, raw } = await createSqlJsHarness();
    const mangaId = await createManga(db, 'race');

    // Simulates the other tab winning between the pre-check and the insert.
    raw.run(`
      CREATE TRIGGER library_entries_race BEFORE INSERT ON library_entries
      WHEN NEW.id <> 'race-winner'
      BEGIN
        INSERT INTO library_entries
          (id, manga_id, favorite, status, unread_count, added_at, updated_at)
        VALUES ('race-winner', NEW.manga_id, 0, NEW.status, 0, NEW.added_at, NEW.updated_at);
      END;
    `);

    const result = await addLibraryEntry(db, { mangaId, status: 'reading' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('db.library.duplicate');
    expect(result.error.message).toBe('Manga is already in the library.');
    // The failed statement also rolls back the trigger's row.
    expect(await listLibraryEntries(db)).toHaveLength(0);
  });
});
