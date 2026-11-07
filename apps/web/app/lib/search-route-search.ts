import type { ContentRating } from '@app/shared';
import { z } from 'zod';

import type { SearchFilters, SearchSort, SearchViewState } from '@/features/search/types.js';

const CONTENT_RATINGS = [
  'unknown',
  'safe',
  'suggestive',
  'mature',
  'explicit',
] as const satisfies readonly ContentRating[];
const SEARCH_SORTS = ['relevance', 'title', 'latest'] as const satisfies readonly SearchSort[];

/**
 * The restorable Search view as URL search params. The query and filters live
 * here so Browser Back and a reload reopen the results the user came from,
 * instead of an empty box.
 */
export interface SearchRouteSearch {
  readonly q?: string | undefined;
  readonly provider?: string | undefined;
  readonly language?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly excludedTags?: readonly string[] | undefined;
  readonly rating?: ContentRating | undefined;
  readonly sort?: SearchSort | undefined;
}

const searchRouteSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  provider: z.string().optional().catch(undefined),
  language: z.string().optional().catch(undefined),
  tags: z.array(z.string()).optional().catch(undefined),
  excludedTags: z.array(z.string()).optional().catch(undefined),
  rating: z.enum(CONTENT_RATINGS).optional().catch(undefined),
  sort: z.enum(SEARCH_SORTS).optional().catch(undefined),
});

/**
 * A malformed or stale link falls back field by field. The query is kept raw so
 * a trailing space typed mid-word survives the URL round trip; the read layer
 * trims it before matching.
 */
export function parseSearchRouteSearch(search: Record<string, unknown>): SearchRouteSearch {
  return searchRouteSearchSchema.parse(search);
}

function filtersFromSearch(search: SearchRouteSearch): SearchFilters {
  return {
    ...(search.provider !== undefined ? { providerId: search.provider } : {}),
    ...(search.language !== undefined && search.language.length > 0
      ? { language: search.language }
      : {}),
    ...(search.tags !== undefined && search.tags.length > 0 ? { includedTags: search.tags } : {}),
    ...(search.excludedTags !== undefined && search.excludedTags.length > 0
      ? { excludedTags: search.excludedTags }
      : {}),
    ...(search.rating !== undefined ? { contentRating: search.rating } : {}),
    ...(search.sort !== undefined ? { sort: search.sort } : {}),
  };
}

export function searchViewStateFromRoute(search: SearchRouteSearch): SearchViewState {
  const filters = filtersFromSearch(search);
  return {
    query: search.q ?? '',
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
  };
}

/** Only non-default fields reach the URL, so `/search` stays clean. */
export function searchRouteSearchFromViewState(viewState: SearchViewState): SearchRouteSearch {
  const filters = viewState.filters ?? {};
  return {
    ...(viewState.query.trim().length > 0 ? { q: viewState.query } : {}),
    ...(filters.providerId !== undefined ? { provider: filters.providerId } : {}),
    ...(filters.language !== undefined && filters.language.length > 0
      ? { language: filters.language }
      : {}),
    ...(filters.includedTags !== undefined && filters.includedTags.length > 0
      ? { tags: [...filters.includedTags] }
      : {}),
    ...(filters.excludedTags !== undefined && filters.excludedTags.length > 0
      ? { excludedTags: [...filters.excludedTags] }
      : {}),
    ...(filters.contentRating !== undefined ? { rating: filters.contentRating } : {}),
    ...(filters.sort !== undefined && filters.sort !== 'relevance' ? { sort: filters.sort } : {}),
  };
}
