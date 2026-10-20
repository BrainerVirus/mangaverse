import type { QueryClient } from '@tanstack/react-query';
import { searchQueryKeys } from '@app/search';

/**
 * Clearing the search box shows recent searches. Cancel any in-flight prefetch
 * before invalidating: a pending blank-query result can otherwise resolve after
 * the write and restore the stale list as fresh.
 */
export async function refreshRecentSearches(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: searchQueryKeys.all });
  await queryClient.invalidateQueries({ queryKey: searchQueryKeys.all });
}
