import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { DEFAULT_SEARCH_VIEW_STATE, searchQueryKeys } from '@app/search';
import { refreshRecentSearches, refreshRecentSearchesAfterWrite } from '../search-recents.js';

describe('refreshRecentSearches', () => {
  it('Given a pending blank-query prefetch, When recents refresh, Then the stale result cannot win', async () => {
    const queryClient = new QueryClient();
    const key = searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE);

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

  it('Given blank pages in both explicit-content partitions, When recents refresh, Then both invalidate and typed searches do not', async () => {
    const queryClient = new QueryClient();
    const blankPublic = searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE, false);
    const blankExplicit = searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE, true);
    const typedPublic = searchQueryKeys.page(
      { ...DEFAULT_SEARCH_VIEW_STATE, query: 'berserk' },
      false,
    );
    const typedExplicit = searchQueryKeys.page(
      { ...DEFAULT_SEARCH_VIEW_STATE, query: 'berserk' },
      true,
    );

    for (const key of [blankPublic, blankExplicit, typedPublic, typedExplicit]) {
      queryClient.setQueryData(key, 'page');
    }

    await refreshRecentSearches(queryClient);

    expect(queryClient.getQueryState(blankPublic)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(blankExplicit)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(typedPublic)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(typedExplicit)?.isInvalidated).toBe(false);
  });

  it('Given a pending non-empty search, When recents refresh, Then that search is not aborted', async () => {
    const queryClient = new QueryClient();
    const key = searchQueryKeys.page({ ...DEFAULT_SEARCH_VIEW_STATE, query: 'berserk' });

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

  it('Given a pending history write, When the box clears, Then recents read only after the write', async () => {
    const queryClient = new QueryClient();
    const key = searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE);

    let written = false;
    let reads = 0;
    // The blank query is observed, as it is while the search box is empty.
    const observer = new QueryObserver<string>(queryClient, {
      queryKey: key,
      queryFn: () => {
        reads += 1;
        return written ? 'berserk' : 'pre-write recents';
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('pre-write recents'));
    expect(reads).toBe(1);

    let resolveWrite!: () => void;
    const write = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const refresh = refreshRecentSearchesAfterWrite(queryClient, write);

    // Flush the microtask queue: without the pending-write await, the refresh
    // would already have started a second read by now.
    for (let tick = 0; tick < 5; tick += 1) {
      await Promise.resolve();
    }
    // The write is still pending, so the blank-query read must not start.
    expect(reads).toBe(1);

    written = true;
    resolveWrite();
    await refresh;

    expect(reads).toBe(2);
    expect(queryClient.getQueryData(key)).toBe('berserk');
    unsubscribe();
  });
});
