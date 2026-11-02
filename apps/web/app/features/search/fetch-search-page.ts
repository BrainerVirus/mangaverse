import type { AppDrizzleDb } from '@app/db';
import { filterMangaIdentitiesByQuery } from './filter-manga-identities.js';
import { applySearchFilters } from './search-filters.js';
import type { SearchPageData, SearchViewState } from './types.js';

const RECENT_SEARCH_LIMIT = 8;

export async function fetchSearchPage(
  db: AppDrizzleDb,
  viewState: SearchViewState,
  explicitContent = false,
): Promise<SearchPageData> {
  const { listMangaIdentities, listSearchHistory } = await import('@app/db');

  const [identities, recentSearches] = await Promise.all([
    listMangaIdentities(db),
    listSearchHistory(db, RECENT_SEARCH_LIMIT),
  ]);

  const trimmedQuery = viewState.query.trim();
  const matches =
    trimmedQuery.length > 0 ? filterMangaIdentitiesByQuery(identities, trimmedQuery) : [];
  const results = applySearchFilters(matches, viewState.filters, explicitContent);

  return {
    results,
    recentSearches,
    viewState,
  };
}
