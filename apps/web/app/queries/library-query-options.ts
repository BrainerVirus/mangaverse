import type { AppDrizzleDb } from '@app/db';
import {
  DEFAULT_LIBRARY_VIEW_STATE,
  fetchLibraryOverview,
  fetchLibraryPage,
  fetchRecentLibrary,
  libraryQueryKeys,
  readLibraryUpdateReport,
  RECENT_LIBRARY_LIMIT,
} from '@app/library';
import type { LibraryFilter, LibraryViewState } from '@app/shared';
import { queryOptions } from '@tanstack/react-query';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-timing.js';

export function libraryPageQueryOptions(
  db: AppDrizzleDb,
  viewState: LibraryViewState = DEFAULT_LIBRARY_VIEW_STATE,
) {
  return queryOptions({
    queryKey: libraryQueryKeys.page(viewState),
    queryFn: () => fetchLibraryPage(db, viewState),
    staleTime: QUERY_STALE_TIMES.library,
    gcTime: QUERY_GC_TIMES.library,
  });
}

export function recentLibraryQueryOptions(db: AppDrizzleDb, limit = RECENT_LIBRARY_LIMIT) {
  return queryOptions({
    queryKey: libraryQueryKeys.recent(limit),
    queryFn: () => fetchRecentLibrary(db, limit),
    staleTime: QUERY_STALE_TIMES.library,
    gcTime: QUERY_GC_TIMES.library,
  });
}

/** Continue reading and recently updated, narrowed by the page's active filter. */
export function libraryOverviewQueryOptions(db: AppDrizzleDb, filter: LibraryFilter = {}) {
  return queryOptions({
    queryKey: libraryQueryKeys.overview(filter),
    queryFn: () => fetchLibraryOverview(db, { filter }),
    staleTime: QUERY_STALE_TIMES.library,
    gcTime: QUERY_GC_TIMES.library,
  });
}

/** The last update-check report, read back after a reload. */
export function libraryUpdateReportQueryOptions(db: AppDrizzleDb) {
  return queryOptions({
    queryKey: libraryQueryKeys.updateReport(),
    // A query must resolve a value: no report yet is `null`, never undefined.
    queryFn: async () => (await readLibraryUpdateReport(db)) ?? null,
    staleTime: 0,
    gcTime: QUERY_GC_TIMES.library,
  });
}
