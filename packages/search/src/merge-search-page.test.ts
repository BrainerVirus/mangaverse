import { describe, expect, it } from 'vitest';
import type { MangaIdentity } from '@app/shared';
import { mergeSearchPageData } from './merge-search-page.js';
import type { SearchPageData } from './types.js';

function makeIdentity(title: string): MangaIdentity {
  return {
    id: `manga-${title}` as MangaIdentity['id'],
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [],
    defaultProviderMappingId: 'map-1' as MangaIdentity['defaultProviderMappingId'],
    merged: false,
  };
}

function makePage(titles: readonly string[]): SearchPageData {
  return {
    results: titles.map(makeIdentity),
    recentSearches: [],
    viewState: { query: 'berserk' },
  };
}

describe('mergeSearchPageData', () => {
  it('keeps local results first and appends provider titles in provider order', () => {
    const local = makePage(['Local Alpha']);
    const provider = [makeIdentity('Provider Beta'), makeIdentity('Provider Gamma')];

    const merged = mergeSearchPageData(local, provider);

    expect(merged?.results.map((item) => item.canonicalTitle)).toEqual([
      'Local Alpha',
      'Provider Beta',
      'Provider Gamma',
    ]);
  });

  it('drops provider titles already present locally regardless of case', () => {
    const local = makePage(['Berserk']);
    const provider = [makeIdentity('bErSeRk'), makeIdentity('Berserk Deluxe')];

    const merged = mergeSearchPageData(local, provider);

    expect(merged?.results.map((item) => item.canonicalTitle)).toEqual([
      'Berserk',
      'Berserk Deluxe',
    ]);
  });

  it('drops repeated provider titles, keeping the first provider identity', () => {
    const local = makePage([]);
    const first = makeIdentity('Berserk');
    const merged = mergeSearchPageData(local, [first, makeIdentity('BERSERK')]);

    expect(merged?.results).toEqual([first]);
  });

  it('returns the same local page when the provider has no results', () => {
    const local = makePage(['Local Alpha']);

    expect(mergeSearchPageData(local, [])).toBe(local);
  });

  it('stays undefined while local data has not loaded', () => {
    expect(mergeSearchPageData(undefined, [makeIdentity('Provider Beta')])).toBeUndefined();
  });
});
