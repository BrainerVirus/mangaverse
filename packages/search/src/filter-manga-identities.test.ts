import { describe, expect, it } from 'vitest';
import type { MangaIdentity } from '@app/shared';
import { filterMangaIdentitiesByQuery } from './filter-manga-identities.js';

function makeIdentity(title: string, alt?: string): MangaIdentity {
  return {
    id: `manga-${title}` as MangaIdentity['id'],
    canonicalTitle: title,
    alternativeTitles: alt ? [{ value: alt, language: 'en' }] : [],
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

describe('filterMangaIdentitiesByQuery', () => {
  it('returns all identities when query is empty', () => {
    const items = [makeIdentity('Alpha'), makeIdentity('Beta')];
    expect(filterMangaIdentitiesByQuery(items, '')).toHaveLength(2);
    expect(filterMangaIdentitiesByQuery(items, '   ')).toHaveLength(2);
  });

  it('matches canonical and alternative titles case-insensitively', () => {
    const items = [makeIdentity('Hidden Gem', 'Secret Title'), makeIdentity('Other')];
    expect(filterMangaIdentitiesByQuery(items, 'hidden')).toHaveLength(1);
    expect(filterMangaIdentitiesByQuery(items, 'SECRET')).toHaveLength(1);
    expect(filterMangaIdentitiesByQuery(items, 'missing')).toHaveLength(0);
  });
});
