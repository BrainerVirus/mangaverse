import { DEFAULT_LIBRARY_VIEW_STATE } from '@/features/library/view-state.js';
import { toCategoryId, toProviderId } from '@app/shared';
import { describe, expect, it } from 'vitest';

import {
  librarySearchFromViewState,
  libraryViewStateFromSearch,
  parseLibraryRouteSearch,
} from '../library-route-search.js';

describe('library route search params', () => {
  it('Given a populated view, When written and read back, Then filter, sort and layout are identical', () => {
    const viewState = {
      layout: 'list',
      sort: { key: 'title', direction: 'asc' },
      filter: {
        query: 'berserk',
        categoryIds: [toCategoryId('category-1')],
        statuses: ['reading'],
        favoritesOnly: true,
        providerIds: [toProviderId('mangadex')],
      },
    } as const;

    const search = librarySearchFromViewState(viewState);
    expect(search).toEqual({
      layout: 'list',
      sort: 'title:asc',
      q: 'berserk',
      category: ['category-1'],
      status: ['reading'],
      favorites: true,
      provider: ['mangadex'],
    });
    expect(libraryViewStateFromSearch(parseLibraryRouteSearch(search))).toEqual(viewState);
  });

  it('Given the default view, Then the URL stays empty and reads back as defaults', () => {
    expect(librarySearchFromViewState(DEFAULT_LIBRARY_VIEW_STATE)).toEqual({});
    expect(libraryViewStateFromSearch({})).toEqual(DEFAULT_LIBRARY_VIEW_STATE);
  });

  it('Given only whitespace in the search box, Then it is not written', () => {
    expect(
      librarySearchFromViewState({ ...DEFAULT_LIBRARY_VIEW_STATE, filter: { query: '   ' } }),
    ).toEqual({});
  });

  it('Given malformed values, Then each field falls back instead of failing the route', () => {
    expect(
      parseLibraryRouteSearch({
        layout: 'carousel',
        sort: 'nonsense',
        status: ['reading', 'not-a-status'],
        favorites: 'yes',
      }),
    ).toEqual({
      layout: undefined,
      sort: 'nonsense',
      status: undefined,
      favorites: undefined,
    });
  });

  it('Given an unknown sort, Then the default sort is used', () => {
    expect(libraryViewStateFromSearch({ sort: 'nonsense' }).sort).toEqual(
      DEFAULT_LIBRARY_VIEW_STATE.sort,
    );
  });

  it('Given an unknown layout, Then the default layout is used', () => {
    expect(libraryViewStateFromSearch({ layout: undefined }).layout).toBe(
      DEFAULT_LIBRARY_VIEW_STATE.layout,
    );
  });
});
