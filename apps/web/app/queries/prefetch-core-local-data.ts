import type { AppDrizzleDb } from '@app/db';
import type { QueryClient } from '@tanstack/react-query';
import { searchPageQueryOptions } from './search-query-options.js';

/**
 * Warm the one route cache the user is likely to open next. The library page is not
 * prefetched: it reads host collections directly (#210), so a `libraryPageQueryOptions`
 * cache would never be read. Settings are not prefetched either: ShellAppearanceBridge,
 * ThemeSettingsBridge, and the reader route already own those reads.
 */
export function prefetchCoreLocalData(queryClient: QueryClient, db: AppDrizzleDb) {
  return queryClient.prefetchQuery(searchPageQueryOptions(db));
}
