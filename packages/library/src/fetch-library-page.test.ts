import { describe, expect, it } from 'vitest';
import {
  addLibraryEntriesToCategories,
  addLibraryEntry,
  createLibraryCategory,
  createMangaIdentityWithInitialMapping,
} from '@app/db';
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
    expect(
      page.items.map((item) => item.manga.canonicalTitle).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['Alpha Series', 'Beta Chronicles']);
  });

  it('reads a 24-entry library with the same statement count as a 2-entry library', async () => {
    const { raw, db } = await createSqlJsHarness();
    const add = async (index: number) => {
      const created = await createMangaIdentityWithInitialMapping(db, {
        canonicalTitle: `Series ${index}`,
        status: 'ongoing',
        contentRating: 'safe',
        providerId: toProviderId('prov-a'),
        providerMangaId: `series-${index}`,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
    };
    await add(0);
    await add(1);

    let statements = 0;
    const prepare = raw.prepare.bind(raw);
    raw.prepare = (...args) => {
      statements += 1;
      return prepare(...args);
    };

    await fetchLibraryPage(db, DEFAULT_LIBRARY_VIEW_STATE);
    const forTwo = statements;

    for (let index = 2; index < 24; index++) await add(index);
    statements = 0;
    const page = await fetchLibraryPage(db, DEFAULT_LIBRARY_VIEW_STATE);

    expect(page.items).toHaveLength(24);
    expect(statements).toBe(forTwo);
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

describe('fetchLibraryPage organization', () => {
  it('combines a repository filter with the query filter and lists providers', async () => {
    const { db } = await createSqlJsHarness();
    const category = await createLibraryCategory(db, { name: 'Action' });
    expect(category.ok).toBe(true);
    if (!category.ok) return;

    const add = async (title: string, status: 'reading' | 'completed') => {
      const created = await createMangaIdentityWithInitialMapping(db, {
        canonicalTitle: title,
        status: 'ongoing',
        contentRating: 'safe',
        providerId: toProviderId('prov-a'),
        providerMangaId: `org-${title}`,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const entry = await addLibraryEntry(db, { mangaId: created.value.mangaId, status });
      expect(entry.ok).toBe(true);
      if (!entry.ok) return;
      await addLibraryEntriesToCategories(db, [entry.value], [category.value]);
    };

    await add('Alpha Action', 'reading');
    await add('Beta Action', 'completed');

    const page = await fetchLibraryPage(db, {
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: { categoryIds: [category.value], statuses: ['reading'], query: 'alpha' },
    });

    expect(page.items.map((item) => item.manga.canonicalTitle)).toEqual(['Alpha Action']);
    expect(page.providers).toEqual([toProviderId('prov-a')]);
    expect(page.categories.map((item) => item.name)).toEqual(['Action']);
  });
});
