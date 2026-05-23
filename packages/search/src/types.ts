import type { MangaIdentity } from '@app/shared';
import type { SearchHistoryEntry } from '@app/db';

export interface SearchViewState {
  readonly query: string;
}

export interface SearchPageData {
  readonly results: readonly MangaIdentity[];
  readonly recentSearches: readonly SearchHistoryEntry[];
  readonly viewState: SearchViewState;
}
