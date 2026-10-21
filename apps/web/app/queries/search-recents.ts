import type { QueryClient } from '@tanstack/react-query';
import { DEFAULT_SEARCH_VIEW_STATE, searchQueryKeys } from '@app/search';

/**
 * Recent searches are the blank-query result. Cancel any in-flight read before
 * invalidating: a pending blank-query result can otherwise resolve after a
 * history write and restore the stale list as fresh. Scoped to the blank key so
 * clearing a non-empty search never aborts the provider search being shown.
 * The key carries no explicit-content partition: recents do not depend on it.
 */
export async function refreshRecentSearches(queryClient: QueryClient): Promise<void> {
  const key = searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE);
  await queryClient.cancelQueries({ queryKey: key });
  await queryClient.invalidateQueries({ queryKey: key });
}

/**
 * Refreshes recents only after a pending history write settles. Clearing while
 * the write is in flight would otherwise let the blank query read the pre-write
 * list and cache it as fresh.
 */
export async function refreshRecentSearchesAfterWrite(
  queryClient: QueryClient,
  write: Promise<unknown> | null,
): Promise<void> {
  if (write !== null) {
    // A failed history write must not block clearing the search box.
    await write.catch(() => undefined);
  }
  await refreshRecentSearches(queryClient);
}
