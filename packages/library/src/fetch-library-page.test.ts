import { describe, expect, it } from 'vitest';
import { addLibraryEntry, createMangaIdentityWithInitialMapping } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toProviderId } from '@app/shared';
import { DEFAULT_LIBRARY_VIEW_STATE } from './view-state.js';
import { fetchLibraryPage } from './fetch-library-page.js';

describe('fetchLibraryPage', () => {
  it('returns library items with manga identities from local db', async () => {
    const { db } = await createSqlJsHarness();

    const alpha = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Alpha Series',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'alpha-1',
    });
    const beta = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Beta Chronicles',
      status: 'completed',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'beta-1',
    });
    expect(alpha.ok && beta.ok).toBe(true);
    if (!alpha.ok || !beta.ok) return;

    await addLibraryEntry(db, { mangaId: alpha.value.mangaId, status: 'reading' });
    await addLibraryEntry(db, { mangaId: beta.value.mangaId, status: 'planned' });

    const page = await fetchLibraryPage(db, DEFAULT_LIBRARY_VIEW_STATE);
    expect(page.items).toHaveLength(2);
    expect(page.items.map((item) => item.manga.canonicalTitle).sort()).toEqual([
      'Alpha Series',
      'Beta Chronicles',
    ]);
  });

  it('filters items by query on canonical titles', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Hidden Gem',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'gem-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });

    const byQuery = await fetchLibraryPage(db, {
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: { query: 'hidden' },
    });
    expect(byQuery.items).toHaveLength(1);

    const none = await fetchLibraryPage(db, {
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: { query: 'missing' },
    });
    expect(none.items).toHaveLength(0);
  });
});
