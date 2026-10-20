import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DEFAULT_SEARCH_VIEW_STATE, searchQueryKeys } from '@app/search';
import { refreshRecentSearches } from '../search-recents.js';

describe('refreshRecentSearches', () => {
  it('Given a pending blank-query prefetch, When recents refresh, Then the stale result cannot win', async () => {
    const queryClient = new QueryClient();
    const key = searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE, false);

    let resolveStale!: (value: string) => void;
    const stale = new Promise<string>((resolve) => {
      resolveStale = resolve;
    });
    const prefetch = queryClient.prefetchQuery({
      queryKey: key,
      queryFn: () => stale,
      staleTime: Number.POSITIVE_INFINITY,
    });

    await refreshRecentSearches(queryClient);
    resolveStale('old recents');
    await prefetch.catch(() => undefined);

    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it('Given a pending non-empty search, When recents refresh, Then that search is not aborted', async () => {
    const queryClient = new QueryClient();
    const key = searchQueryKeys.page({ ...DEFAULT_SEARCH_VIEW_STATE, query: 'berserk' }, false);

    let resolveResults!: (value: string) => void;
    const results = new Promise<string>((resolve) => {
      resolveResults = resolve;
    });
    const prefetch = queryClient.prefetchQuery({
      queryKey: key,
      queryFn: () => results,
      staleTime: Number.POSITIVE_INFINITY,
    });

    await refreshRecentSearches(queryClient);
    resolveResults('search results');
    await prefetch;

    expect(queryClient.getQueryData(key)).toBe('search results');
  });
});
