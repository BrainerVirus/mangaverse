import type { AppDrizzleDb } from '@app/db';
import { filterMangaIdentitiesByQuery } from './filter-manga-identities.js';
import type { SearchPageData, SearchViewState } from './types.js';

const RECENT_SEARCH_LIMIT = 8;

export async function fetchSearchPage(
  db: AppDrizzleDb,
  viewState: SearchViewState,
): Promise<SearchPageData> {
  const { listMangaIdentities, listSearchHistory } = await import('@app/db');

  const [identities, recentSearches] = await Promise.all([
    listMangaIdentities(db),
    listSearchHistory(db, RECENT_SEARCH_LIMIT),
  ]);

  const trimmedQuery = viewState.query.trim();
  const results =
    trimmedQuery.length > 0
      ? filterMangaIdentitiesByQuery(identities, trimmedQuery)
      : [];

  return {
    results,
    recentSearches,
    viewState,
  };
}
