import type { AppDrizzleDb } from '@app/db';
import type { QueryClient } from '@tanstack/react-query';
import { libraryPageQueryOptions } from './library-query-options.js';
import { searchPageQueryOptions } from './search-query-options.js';

/**
 * Warm the two route caches the user is likely to open next. Settings are not
 * prefetched: ShellAppearanceBridge, ThemeSettingsBridge, and the reader route
 * already own those reads, and duplicating them at startup only fans out work.
 */
export function prefetchCoreLocalData(queryClient: QueryClient, db: AppDrizzleDb) {
  return Promise.all([
    queryClient.prefetchQuery(libraryPageQueryOptions(db)),
    queryClient.prefetchQuery(searchPageQueryOptions(db)),
  ]);
}
