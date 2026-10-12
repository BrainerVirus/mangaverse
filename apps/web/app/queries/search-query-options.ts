import type { AppDrizzleDb } from '@app/db';
import {
  DEFAULT_SEARCH_VIEW_STATE,
  fetchSearchPage,
  searchQueryKeys,
} from '@app/search';
import type { SearchViewState } from '@app/search';
import { queryOptions } from '@tanstack/react-query';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-timing.js';
import { fetchDevMangaDexSearchResults, isMangaDexInstalled } from '../lib/dev-mangadex-search.js';

export function searchPageQueryOptions(
  db: AppDrizzleDb,
  viewState: SearchViewState = DEFAULT_SEARCH_VIEW_STATE,
  explicitContent = false,
) {
  return queryOptions({
    queryKey: searchQueryKeys.page(viewState, explicitContent),
    queryFn: async () => {
      const local = await fetchSearchPage(db, viewState);
      const trimmed = viewState.query.trim();

      if (!import.meta.env.DEV || trimmed.length === 0) {
        return local;
      }

      const mangadexInstalled = await isMangaDexInstalled(db);
      if (!mangadexInstalled) {
        return local;
      }

      try {
        const remote = await fetchDevMangaDexSearchResults(trimmed, explicitContent);
        const localIds = new Set(local.results.map((item) => item.canonicalTitle.toLowerCase()));
        const merged = [
          ...local.results,
          ...remote.filter((item) => !localIds.has(item.canonicalTitle.toLowerCase())),
        ];
        return { ...local, results: merged };
      } catch {
        return local;
      }
    },
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
  });
}
