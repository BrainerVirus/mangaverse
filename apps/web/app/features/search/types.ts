import type { SearchHistoryEntry } from '@app/db';
import type { ContentRating, MangaIdentity } from '@app/shared';

export type SearchSort = 'relevance' | 'title' | 'latest';

/**
 * Filters applied to identities the app already stores. `providerId` narrows
 * which remote providers are queried; local results always stay visible.
 */
export interface SearchFilters {
  readonly providerId?: string | undefined;
  readonly language?: string | undefined;
  readonly includedTags?: readonly string[] | undefined;
  readonly excludedTags?: readonly string[] | undefined;
  readonly contentRating?: ContentRating | undefined;
  readonly sort?: SearchSort | undefined;
}

export interface SearchViewState {
  readonly query: string;
  readonly filters?: SearchFilters;
}

/** One provider's slice of a global search, kept apart so failures stay local to it. */
export interface SearchProviderResult {
  readonly providerId: string;
  readonly results: readonly MangaIdentity[];
}

export interface SearchPageData {
  readonly results: readonly MangaIdentity[];
  readonly recentSearches: readonly SearchHistoryEntry[];
  readonly viewState: SearchViewState;
}
