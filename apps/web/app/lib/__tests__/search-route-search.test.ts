import { describe, expect, it } from 'vitest';

import {
  parseSearchRouteSearch,
  searchRouteSearchFromViewState,
  searchViewStateFromRoute,
} from '../search-route-search.js';

describe('search route search params', () => {
  it('Given a query and filters, When written and read back, Then the view is identical', () => {
    const viewState = {
      query: 'berserk',
      filters: {
        providerId: 'mangadex',
        language: 'en',
        includedTags: ['action', 'comedy'],
        excludedTags: ['drama'],
        contentRating: 'safe',
        sort: 'title',
      },
    } as const;

    const search = searchRouteSearchFromViewState(viewState);
    expect(search).toEqual({
      q: 'berserk',
      provider: 'mangadex',
      language: 'en',
      tags: ['action', 'comedy'],
      excludedTags: ['drama'],
      rating: 'safe',
      sort: 'title',
    });
    expect(searchViewStateFromRoute(parseSearchRouteSearch(search))).toEqual(viewState);
  });

  it('Given an empty view, Then the URL stays empty and reads back as defaults', () => {
    const search = searchRouteSearchFromViewState({ query: '', filters: {} });
    expect(search).toEqual({});
    expect(searchViewStateFromRoute(search)).toEqual({ query: '' });
  });

  it('Given only whitespace, Then the query is not written but the input keeps it locally', () => {
    expect(searchRouteSearchFromViewState({ query: '   ' })).toEqual({});
  });

  it('Given the default relevance sort, Then it is omitted from the URL', () => {
    expect(searchRouteSearchFromViewState({ query: 'x', filters: { sort: 'relevance' } })).toEqual({
      q: 'x',
    });
  });

  it('Given empty filter arrays, Then they are omitted', () => {
    expect(
      searchRouteSearchFromViewState({
        query: 'x',
        filters: { includedTags: [], excludedTags: [], language: '' },
      }),
    ).toEqual({ q: 'x' });
  });

  it('Given malformed params, Then each field falls back instead of failing the route', () => {
    expect(
      parseSearchRouteSearch({
        q: 'berserk',
        rating: 'ultra-violent',
        sort: 'sideways',
        tags: ['action'],
      }),
    ).toEqual({ q: 'berserk', rating: undefined, sort: undefined, tags: ['action'] });
  });

  it('Given a repeated tag list, Then it round-trips as an array', () => {
    const search = parseSearchRouteSearch({ q: 'x', tags: ['a', 'b'] });
    expect(search.tags).toEqual(['a', 'b']);
    expect(searchViewStateFromRoute(search).filters?.includedTags).toEqual(['a', 'b']);
  });
});
