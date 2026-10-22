import type { Query, QueryClient } from '@tanstack/react-query';

/** Blank-query page keys, whatever explicit-content partition they carry. */
function isBlankSearchPage(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key[0] !== 'search' || key[1] !== 'page') return false;
  const viewState = key[2];
  return (
    typeof viewState === 'object' &&
    viewState !== null &&
    'query' in viewState &&
    typeof viewState.query === 'string' &&
    viewState.query.trim().length === 0
  );
}

/**
 * Recent searches are the blank-query result. Cancel any in-flight blank read
 * before invalidating: a pending blank-query result can otherwise resolve after
 * a history write and restore the stale list as fresh. Non-empty searches stay
 * untouched so returning to them does not refetch, and provider queries have
 * their own keys.
 */
export async function refreshRecentSearches(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ predicate: isBlankSearchPage });
  await queryClient.invalidateQueries({ predicate: isBlankSearchPage });
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
