import type { AppDrizzleDb } from '@app/db';
import { DEFAULT_SEARCH_VIEW_STATE, fetchSearchPage, searchQueryKeys } from '@app/search';
import type { SearchViewState } from '@app/search';
import { queryOptions } from '@tanstack/react-query';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-timing.js';
import { fetchProviderSearchIdentities } from './provider-query-options.js';

/** Local identities and recent searches; never waits on a provider round trip. */
export function searchPageQueryOptions(
  db: AppDrizzleDb,
  viewState: SearchViewState = DEFAULT_SEARCH_VIEW_STATE,
  explicitContent = false,
) {
  return queryOptions({
    queryKey: searchQueryKeys.page(viewState, explicitContent),
    queryFn: () => fetchSearchPage(db, viewState),
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
  });
}

/**
 * Provider identities for the typed query. Disabled for blank queries so the
 * recents view never triggers a provider request.
 */
export function searchProviderQueryOptions(
  db: AppDrizzleDb,
  query: string,
  explicitContent = false,
  enabled = true,
) {
  const trimmed = query.trim();

  return queryOptions({
    queryKey: searchQueryKeys.provider(trimmed, explicitContent),
    queryFn: ({ signal }) => fetchProviderSearchIdentities(db, trimmed, signal),
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
    enabled: enabled && trimmed.length > 0,
  });
}
