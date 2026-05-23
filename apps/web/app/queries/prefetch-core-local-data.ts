import type { AppDrizzleDb } from '@app/db';
import type { QueryClient } from '@tanstack/react-query';
import { libraryPageQueryOptions } from './library-query-options.js';
import { searchPageQueryOptions } from './search-query-options.js';
import {
  appSettingsQueryOptions,
  readerSettingsQueryOptions,
} from './settings-query-options.js';

/** Prefetch high-traffic local-first routes once SQLite is ready. */
export function prefetchCoreLocalData(queryClient: QueryClient, db: AppDrizzleDb) {
  return Promise.all([
    queryClient.prefetchQuery(libraryPageQueryOptions(db)),
    queryClient.prefetchQuery(searchPageQueryOptions(db)),
    queryClient.prefetchQuery(appSettingsQueryOptions(db)),
    queryClient.prefetchQuery(readerSettingsQueryOptions(db)),
  ]);
}
