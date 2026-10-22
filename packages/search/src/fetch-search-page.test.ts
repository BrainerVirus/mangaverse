import { describe, expect, it } from 'vitest';
import type { AppDrizzleDb } from '@app/db';
import { appendSearchHistory, createMangaIdentityWithInitialMapping } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toProviderId } from '@app/shared';
import { fetchSearchPage } from './fetch-search-page.js';
import { recordSearchQuery } from './record-search-query.js';
import { DEFAULT_SEARCH_VIEW_STATE } from './view-state.js';

describe('fetchSearchPage', () => {
  it('returns empty results and recent searches when query is blank', async () => {
    const { db } = await createSqlJsHarness();

    await appendSearchHistory(db, { query: 'one piece' });
    await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Local Title',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'local-1',
    });

    const page = await fetchSearchPage(db, DEFAULT_SEARCH_VIEW_STATE);
    expect(page.results).toHaveLength(0);
    expect(page.recentSearches.map((entry) => entry.query)).toContain('one piece');
  });

  it('filters local manga identities by query', async () => {
    const { db } = await createSqlJsHarness();

    await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Alpha Series',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'alpha-1',
    });
    await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Beta Chronicles',
      status: 'completed',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'beta-1',
    });

    const page = await fetchSearchPage(db, { query: 'alpha' });
    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.canonicalTitle).toBe('Alpha Series');
  });

  it('applies language and explicit-content filters to stored identities', async () => {
    const { db } = await createSqlJsHarness();

    await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Alpha English',
      status: 'ongoing',
      contentRating: 'safe',
      language: 'en',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'alpha-en',
    });
    await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Alpha Japanese',
      status: 'ongoing',
      contentRating: 'safe',
      language: 'ja',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'alpha-ja',
    });
    await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Alpha Explicit',
      status: 'ongoing',
      contentRating: 'explicit',
      language: 'en',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'alpha-explicit',
    });

    const filtered = await fetchSearchPage(db, {
      query: 'alpha',
      filters: { language: 'en' },
    });
    expect(filtered.results.map((item) => item.canonicalTitle)).toEqual(['Alpha English']);

    const allowed = await fetchSearchPage(
      db,
      { query: 'alpha', filters: { language: 'en' } },
      true,
    );
    expect(
      allowed.results.map((item) => item.canonicalTitle).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['Alpha English', 'Alpha Explicit']);
  });
});

describe('recordSearchQuery', () => {
  it('persists trimmed queries to search history', async () => {
    const { db } = await createSqlJsHarness();

    await recordSearchQuery(db, '  naruto  ');
    const page = await fetchSearchPage(db, DEFAULT_SEARCH_VIEW_STATE);
    expect(page.recentSearches[0]?.query).toBe('naruto');
  });

  it('skips empty queries', async () => {
    const { db } = await createSqlJsHarness();

    await recordSearchQuery(db, '   ');
    const page = await fetchSearchPage(db, DEFAULT_SEARCH_VIEW_STATE);
    expect(page.recentSearches).toHaveLength(0);
  });

  it('records a query typed while the database session is still opening', async () => {
    const { db } = await createSqlJsHarness();
    let openDb!: (value: AppDrizzleDb) => void;
    const openingDb = new Promise<AppDrizzleDb>((resolve) => {
      openDb = resolve;
    });

    const write = recordSearchQuery(openingDb, 'berserk');
    expect((await fetchSearchPage(db, DEFAULT_SEARCH_VIEW_STATE)).recentSearches).toHaveLength(0);

    openDb(db);
    await write;
    expect((await fetchSearchPage(db, DEFAULT_SEARCH_VIEW_STATE)).recentSearches[0]?.query).toBe(
      'berserk',
    );
  });
});
