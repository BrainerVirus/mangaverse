import type { AppDrizzleDb } from '@app/db';
import {
  DEFAULT_SEARCH_VIEW_STATE,
  fetchSearchPage,
  searchQueryKeys,
} from '@app/search';
import type { SearchViewState } from '@app/search';
import { queryOptions } from '@tanstack/react-query';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-timing.js';

export function searchPageQueryOptions(
  db: AppDrizzleDb,
  viewState: SearchViewState = DEFAULT_SEARCH_VIEW_STATE,
) {
  return queryOptions({
    queryKey: searchQueryKeys.page(viewState),
    queryFn: () => fetchSearchPage(db, viewState),
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
  });
}
