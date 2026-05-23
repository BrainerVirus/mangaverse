import type { AppDrizzleDb } from '@app/db';
import {
  DEFAULT_LIBRARY_VIEW_STATE,
  fetchLibraryPage,
  libraryQueryKeys,
} from '@app/library';
import type { LibraryViewState } from '@app/shared';
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
