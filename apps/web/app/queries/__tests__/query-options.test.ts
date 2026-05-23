import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DEFAULT_LIBRARY_VIEW_STATE, libraryQueryKeys } from '@app/library';
import { DEFAULT_SEARCH_VIEW_STATE, searchQueryKeys } from '@app/search';
import { settingsQueryKeys } from '@app/settings';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from '../query-timing.js';
import { libraryPageQueryOptions } from '../library-query-options.js';
import { searchPageQueryOptions } from '../search-query-options.js';
import {
  appSettingsQueryOptions,
  readerSettingsQueryOptions,
} from '../settings-query-options.js';
import { prefetchCoreLocalData } from '../prefetch-core-local-data.js';

const mockDb = {} as Parameters<typeof libraryPageQueryOptions>[0];

describe('query-timing', () => {
  it('keeps local SQLite data fresher longer than search aggregation', () => {
    expect(QUERY_STALE_TIMES.library).toBeGreaterThan(QUERY_STALE_TIMES.search);
    expect(QUERY_STALE_TIMES.settings).toBeGreaterThan(QUERY_STALE_TIMES.search);
  });

  it('retains library and settings caches longer than search', () => {
    expect(QUERY_GC_TIMES.library).toBeGreaterThan(QUERY_GC_TIMES.search);
    expect(QUERY_GC_TIMES.settings).toBeGreaterThan(QUERY_GC_TIMES.search);
  });
});

describe('libraryPageQueryOptions', () => {
  it('uses library query keys and tuned cache windows', () => {
    const options = libraryPageQueryOptions(mockDb, DEFAULT_LIBRARY_VIEW_STATE);

    expect(options.queryKey).toEqual(libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE));
    expect(options.staleTime).toBe(QUERY_STALE_TIMES.library);
    expect(options.gcTime).toBe(QUERY_GC_TIMES.library);
    expect(typeof options.queryFn).toBe('function');
  });
});

describe('searchPageQueryOptions', () => {
  it('uses search query keys and tuned cache windows', () => {
    const options = searchPageQueryOptions(mockDb, DEFAULT_SEARCH_VIEW_STATE);

    expect(options.queryKey).toEqual(searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE));
    expect(options.staleTime).toBe(QUERY_STALE_TIMES.search);
    expect(options.gcTime).toBe(QUERY_GC_TIMES.search);
  });
});

describe('settings query options', () => {
  it('uses app settings query keys and tuned cache windows', () => {
    const options = appSettingsQueryOptions(mockDb);

    expect(options.queryKey).toEqual(settingsQueryKeys.app());
    expect(options.staleTime).toBe(QUERY_STALE_TIMES.settings);
    expect(options.gcTime).toBe(QUERY_GC_TIMES.settings);
  });

  it('uses reader settings query keys and tuned cache windows', () => {
    const options = readerSettingsQueryOptions(mockDb);

    expect(options.queryKey).toEqual(settingsQueryKeys.reader());
    expect(options.staleTime).toBe(QUERY_STALE_TIMES.settings);
    expect(options.gcTime).toBe(QUERY_GC_TIMES.settings);
  });
});

describe('prefetchCoreLocalData', () => {
  it('prefetches library, search, and settings queries', async () => {
    const queryClient = new QueryClient();
    const prefetchSpy = vi.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);

    await prefetchCoreLocalData(queryClient, mockDb);

    expect(prefetchSpy).toHaveBeenCalledTimes(4);
    expect(prefetchSpy.mock.calls.map(([options]) => options.queryKey)).toEqual([
      libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE),
      searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE),
      settingsQueryKeys.app(),
      settingsQueryKeys.reader(),
    ]);
  });
});
