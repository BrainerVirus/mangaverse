import type { AppDrizzleDb } from '@app/db';
import { listSavedSearches } from '@app/db/browser';
import { DEFAULT_SEARCH_VIEW_STATE, fetchSearchPage, searchQueryKeys } from '@/features/search';
import type { SearchViewState } from '@/features/search';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-timing.js';
import { fetchProviderSearchIdentities, listSearchProviders } from './provider-query-options.js';

/**
 * Local identities and recent searches; never waits on a provider round trip.
 * The previous page stays on screen while the next query reads, so typing never
 * blanks the grid.
 */
export function searchPageQueryOptions(
  db: AppDrizzleDb,
  viewState: SearchViewState = DEFAULT_SEARCH_VIEW_STATE,
  explicitContent = false,
) {
  return queryOptions({
    queryKey: searchQueryKeys.page(viewState, explicitContent),
    queryFn: () => fetchSearchPage(db, viewState, explicitContent),
    placeholderData: keepPreviousData,
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
  });
}

/** Providers that can answer a search; capability-filtered before any fan-out. */
export function searchProvidersQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: searchQueryKeys.providers(),
    queryFn: () => listSearchProviders(db),
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
  });
}

/**
 * Provider identities for the typed query, one query per provider so a failure
 * or a retry stays local to that provider. Disabled for blank queries.
 */
export function searchProviderQueryOptions(
  db: AppDrizzleDb,
  providerId: string,
  query: string,
  explicitContent = false,
  enabled = true,
) {
  const trimmed = query.trim();

  return queryOptions({
    queryKey: searchQueryKeys.provider(providerId, trimmed, explicitContent),
    queryFn: ({ signal }) =>
      fetchProviderSearchIdentities(db, providerId, trimmed, signal, explicitContent),
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
    enabled: enabled && trimmed.length > 0,
  });
}

/** Saved searches are local rows; writes invalidate this key, not the result grid. */
export function savedSearchesQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: searchQueryKeys.savedSearches(),
    queryFn: () => listSavedSearches(db),
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
  });
}
