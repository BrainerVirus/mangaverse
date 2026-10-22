import { describe, expect, it } from 'vitest';
import type { ContentRating, MangaIdentity } from '@app/shared';
import {
  applySearchFilters,
  matchesSearchFilters,
  parseSearchFilters,
  parseTagList,
  sortSearchResults,
} from './search-filters.js';
import type { SearchFilters } from './types.js';

function makeIdentity(
  title: string,
  options: {
    tags?: readonly { id?: string; label: string }[];
    language?: string;
    contentRating?: ContentRating;
    updatedAt?: string;
  } = {},
): MangaIdentity {
  return {
    id: `manga-${title}` as MangaIdentity['id'],
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: options.tags ?? [],
    status: 'ongoing',
    contentRating: options.contentRating ?? 'safe',
    ...(options.language !== undefined ? { language: options.language } : {}),
    ...(options.updatedAt !== undefined ? { updatedAt: options.updatedAt } : {}),
    providerMappings: [],
    defaultProviderMappingId: 'map-1' as MangaIdentity['defaultProviderMappingId'],
    merged: false,
  };
}

describe('matchesSearchFilters', () => {
  it('hides explicit ratings unless the app allows explicit content', () => {
    const mature = makeIdentity('Mature', { contentRating: 'mature' });
    const explicit = makeIdentity('Explicit', { contentRating: 'explicit' });
    const safe = makeIdentity('Safe');

    expect(matchesSearchFilters(mature, {}, false)).toBe(false);
    expect(matchesSearchFilters(explicit, {}, false)).toBe(false);
    expect(matchesSearchFilters(safe, {}, false)).toBe(true);
    expect(matchesSearchFilters(mature, {}, true)).toBe(true);
  });

  it('keeps identities whose language or rating is unknown', () => {
    const unknown = makeIdentity('Unknown', { contentRating: 'unknown' });

    expect(matchesSearchFilters(unknown, { language: 'en', contentRating: 'safe' })).toBe(true);
  });

  it('matches a language by its primary subtag', () => {
    const english = makeIdentity('English', { language: 'en-US' });
    const japanese = makeIdentity('Japanese', { language: 'ja' });

    expect(matchesSearchFilters(english, { language: 'en' })).toBe(true);
    expect(matchesSearchFilters(japanese, { language: 'en' })).toBe(false);
  });

  it('requires one included tag and rejects any excluded tag, by label or id', () => {
    const identity = makeIdentity('Tagged', {
      tags: [{ id: 'tag-action', label: 'Action' }, { label: 'Drama' }],
    });

    expect(matchesSearchFilters(identity, { includedTags: ['action'] })).toBe(true);
    expect(matchesSearchFilters(identity, { includedTags: ['tag-action'] })).toBe(true);
    expect(matchesSearchFilters(identity, { includedTags: ['Comedy'] })).toBe(false);
    expect(matchesSearchFilters(identity, { excludedTags: ['drama'] })).toBe(false);
    expect(matchesSearchFilters(identity, { excludedTags: ['comedy'] })).toBe(true);
  });

  it('does not drop identities with no tags, because remote items carry none', () => {
    expect(matchesSearchFilters(makeIdentity('Remote'), { includedTags: ['action'] })).toBe(true);
  });

  it('filters by exact known content rating', () => {
    const suggestive = makeIdentity('Suggestive', { contentRating: 'suggestive' });

    expect(matchesSearchFilters(suggestive, { contentRating: 'suggestive' })).toBe(true);
    expect(matchesSearchFilters(suggestive, { contentRating: 'safe' })).toBe(false);
  });
});

describe('sortSearchResults', () => {
  const alpha = makeIdentity('Alpha', { updatedAt: '2026-01-01T00:00:00Z' });
  const beta = makeIdentity('Beta', { updatedAt: '2026-05-01T00:00:00Z' });
  const gamma = makeIdentity('Gamma');

  it('keeps relevance order untouched', () => {
    expect(sortSearchResults([beta, alpha, gamma]).map((item) => item.canonicalTitle)).toEqual([
      'Beta',
      'Alpha',
      'Gamma',
    ]);
  });

  it('sorts by title', () => {
    expect(
      sortSearchResults([beta, gamma, alpha], 'title').map((item) => item.canonicalTitle),
    ).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by most recent update, unknown timestamps last', () => {
    expect(
      sortSearchResults([gamma, alpha, beta], 'latest').map((item) => item.canonicalTitle),
    ).toEqual(['Beta', 'Alpha', 'Gamma']);
  });
});

describe('parseSearchFilters', () => {
  it('keeps valid saved filters and drops unknown or malformed values', () => {
    const filters = parseSearchFilters({
      language: 'en',
      includedTags: ['action'],
      sort: 'latest',
      contentRating: 'safe',
      unknown: true,
    });

    expect(filters).toEqual({
      language: 'en',
      includedTags: ['action'],
      sort: 'latest',
      contentRating: 'safe',
    });
    expect(parseSearchFilters({ sort: 'sideways', language: 42 })).toEqual({});
    expect(parseSearchFilters(null)).toEqual({});
  });
});

describe('parseTagList', () => {
  it('splits, trims and drops empty tags', () => {
    expect(parseTagList(' action , , comedy ')).toEqual(['action', 'comedy']);
  });
});

describe('applySearchFilters', () => {
  it('filters and sorts in one pass', () => {
    const filters: SearchFilters = { sort: 'title', excludedTags: ['drama'] };
    const results = applySearchFilters(
      [
        makeIdentity('Zulu', { tags: [{ label: 'Action' }] }),
        makeIdentity('Alpha', { tags: [{ label: 'Action' }] }),
        makeIdentity('Drama', { tags: [{ label: 'Drama' }] }),
      ],
      filters,
    );

    expect(results.map((item) => item.canonicalTitle)).toEqual(['Alpha', 'Zulu']);
  });
});
