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

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * A rate-limit refusal is not retried: its remaining wait is shown with the
 * Retry control, and a second request only spends the parked budget. The error
 * may arrive wrapped by `fetchProviderSearchIdentities`, so the cause chain is
 * followed too.
 */
function isRateLimitFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    const code = errorCode(current);
    if (code === 'extensions.sdk.ratelimit.blocked') return true;
    if (code === 'extensions.sdk.request.http_error') {
      const details = (current as { readonly details?: { readonly status?: unknown } }).details;
      if (details?.status === 429) return true;
    }
    current = (current as { readonly cause?: unknown }).cause;
  }
  return false;
}

/** One retry for a transient provider failure; never for a rate-limit park. */
export function shouldRetryProviderSearch(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !isRateLimitFailure(error);
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
    // A rate-limit refusal is surfaced with its Retry control instead of silently
    // spending a second request. A transient provider failure gets one retry, so a
    // blip does not blank the remote results.
    retry: shouldRetryProviderSearch,
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
