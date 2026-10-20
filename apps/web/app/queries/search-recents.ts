import type { QueryClient } from '@tanstack/react-query';
import { DEFAULT_SEARCH_VIEW_STATE, searchQueryKeys } from '@app/search';

/**
 * Recent searches are the blank-query result. Cancel any in-flight read before
 * invalidating: a pending blank-query result can otherwise resolve after a
 * history write and restore the stale list as fresh. Scoped to the blank key so
 * clearing a non-empty search never aborts the provider search being shown.
 */
export async function refreshRecentSearches(
  queryClient: QueryClient,
  explicitContent = false,
): Promise<void> {
  const key = searchQueryKeys.page(DEFAULT_SEARCH_VIEW_STATE, explicitContent);
  await queryClient.cancelQueries({ queryKey: key });
  await queryClient.invalidateQueries({ queryKey: key });
}
