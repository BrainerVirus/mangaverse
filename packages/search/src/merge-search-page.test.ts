import { describe, expect, it } from 'vitest';
import { toProviderId, toProviderMangaId, toProviderMappingId } from '@app/shared';
import type { ContentRating, MangaIdentity, MangaProviderMapping } from '@app/shared';
import { mergeSearchPageData } from './merge-search-page.js';
import type { SearchPageData } from './types.js';

interface IdentityOptions {
  readonly providerId?: string;
  readonly providerMangaId?: string;
  readonly tags?: readonly string[];
  readonly language?: string;
  readonly contentRating?: ContentRating;
  readonly updatedAt?: string;
}

function mapping(providerId: string, providerMangaId: string): MangaProviderMapping {
  return {
    id: toProviderMappingId(`${providerId}-${providerMangaId}`),
    providerId: toProviderId(providerId),
    providerMangaId: toProviderMangaId(providerMangaId),
  };
}

function makeIdentity(title: string, options: IdentityOptions = {}): MangaIdentity {
  const providerId = options.providerId ?? 'local';
  const providerMangaId = options.providerMangaId ?? title;
  const first = mapping(providerId, providerMangaId);
  return {
    id: `manga-${title}` as MangaIdentity['id'],
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: (options.tags ?? []).map((label) => ({ label })),
    status: 'ongoing',
    contentRating: options.contentRating ?? 'safe',
    ...(options.language !== undefined ? { language: options.language } : {}),
    providerMappings: [first],
    defaultProviderMappingId: first.id,
    ...(options.updatedAt !== undefined ? { updatedAt: options.updatedAt } : {}),
    merged: false,
  };
}

function makePage(titles: readonly string[]): SearchPageData {
  return {
    results: titles.map((title) => makeIdentity(title)),
    recentSearches: [],
    viewState: { query: 'berserk' },
  };
}

describe('mergeSearchPageData', () => {
  it('keeps local results first and appends provider titles in provider order', () => {
    const local = makePage(['Local Alpha']);
    const provider = [
      { providerId: 'prov-a', results: [makeIdentity('Provider Beta', { providerId: 'prov-a' })] },
      { providerId: 'prov-b', results: [makeIdentity('Provider Gamma', { providerId: 'prov-b' })] },
    ];

    const merged = mergeSearchPageData(local, provider);

    expect(merged?.results.map((item) => item.canonicalTitle)).toEqual([
      'Local Alpha',
      'Provider Beta',
      'Provider Gamma',
    ]);
  });

  it('keeps a provider work that shares a local title but not its provider mapping', () => {
    const local = makePage(['Berserk']);
    const provider = [
      { providerId: 'prov-a', results: [makeIdentity('bErSeRk', { providerId: 'prov-a' })] },
      { providerId: 'prov-a', results: [makeIdentity('Berserk Deluxe', { providerId: 'prov-a' })] },
    ];

    const merged = mergeSearchPageData(local, provider);

    expect(merged?.results.map((item) => item.canonicalTitle)).toEqual([
      'Berserk',
      'bErSeRk',
      'Berserk Deluxe',
    ]);
  });

  it('deduplicates the same provider mapping even when the title differs', () => {
    const local: SearchPageData = {
      ...makePage([]),
      results: [makeIdentity('Local Name', { providerId: 'prov-a', providerMangaId: 'same-id' })],
    };
    const provider = [
      {
        providerId: 'prov-a',
        results: [
          makeIdentity('Provider Name', { providerId: 'prov-a', providerMangaId: 'same-id' }),
        ],
      },
    ];

    const merged = mergeSearchPageData(local, provider);

    expect(merged?.results.map((item) => item.canonicalTitle)).toEqual(['Local Name']);
  });

  it('keeps the same title from two providers when their mappings differ', () => {
    const first = makeIdentity('Berserk', { providerId: 'prov-a', providerMangaId: 'a-1' });
    const second = makeIdentity('BERSERK', { providerId: 'prov-b', providerMangaId: 'b-1' });
    const merged = mergeSearchPageData(makePage([]), [
      { providerId: 'prov-a', results: [first] },
      { providerId: 'prov-b', results: [second] },
    ]);

    expect(merged?.results).toEqual([first, second]);
  });

  it('returns the same local page when the provider has no results', () => {
    const local = makePage(['Local Alpha']);

    expect(mergeSearchPageData(local, [])).toBe(local);
  });

  it('stays undefined while local data has not loaded', () => {
    expect(
      mergeSearchPageData(undefined, [
        {
          providerId: 'prov-a',
          results: [makeIdentity('Provider Beta', { providerId: 'prov-a' })],
        },
      ]),
    ).toBeUndefined();
  });

  it('applies language, tag and rating filters to provider identities', () => {
    const provider = [
      {
        providerId: 'prov-a',
        results: [
          makeIdentity('English Action', {
            providerId: 'prov-a',
            language: 'en',
            tags: ['Action'],
          }),
          makeIdentity('Japanese Drama', {
            providerId: 'prov-a',
            language: 'ja',
            tags: ['Drama'],
          }),
          makeIdentity('Explicit Action', {
            providerId: 'prov-a',
            language: 'en',
            tags: ['Action'],
            contentRating: 'explicit',
          }),
        ],
      },
    ];

    const merged = mergeSearchPageData(makePage([]), provider, {
      filters: { language: 'en', includedTags: ['action'], contentRating: 'safe' },
    });

    expect(merged?.results.map((item) => item.canonicalTitle)).toEqual(['English Action']);
  });

  it('sorts merged results by title when asked', () => {
    const merged = mergeSearchPageData(
      {
        ...makePage([]),
        results: [makeIdentity('Zulu', { providerId: 'local' })],
      },
      [{ providerId: 'prov-a', results: [makeIdentity('Alpha', { providerId: 'prov-a' })] }],
      { filters: { sort: 'title' } },
    );

    expect(merged?.results.map((item) => item.canonicalTitle)).toEqual(['Alpha', 'Zulu']);
  });
});
