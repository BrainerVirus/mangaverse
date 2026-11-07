import type {
  LibraryFilter,
  LibraryLayoutMode,
  LibrarySort,
  LibrarySortDirection,
  LibrarySortKey,
  LibraryStatus,
  LibraryViewState,
} from '@app/shared';
import { toCategoryId, toProviderId } from '@app/shared';
import { z } from 'zod';

import { DEFAULT_LIBRARY_VIEW_STATE } from '@/features/library/view-state.js';

const LAYOUTS = ['grid', 'list', 'compact'] as const satisfies readonly LibraryLayoutMode[];
const SORT_KEYS = [
  'title',
  'last_read',
  'last_updated',
  'date_added',
  'unread',
  'provider',
  'progress',
] as const satisfies readonly LibrarySortKey[];
const SORT_DIRECTIONS = ['asc', 'desc'] as const satisfies readonly LibrarySortDirection[];
const STATUSES = [
  'reading',
  'completed',
  'on_hold',
  'dropped',
  'planned',
] as const satisfies readonly LibraryStatus[];

/**
 * The restorable Library view as URL search params. The filter, sort and layout
 * live here so Browser Back and a reload restore the list the user came from;
 * transient overlays (the Filters sheet, category manager, bulk selection) do
 * not.
 */
export interface LibraryRouteSearch {
  readonly layout?: LibraryLayoutMode | undefined;
  /** `key:direction`, e.g. `title:asc`; the default is omitted. */
  readonly sort?: string | undefined;
  readonly q?: string | undefined;
  readonly category?: readonly string[] | undefined;
  readonly status?: readonly LibraryStatus[] | undefined;
  readonly favorites?: boolean | undefined;
  readonly provider?: readonly string[] | undefined;
}

const libraryRouteSearchSchema = z.object({
  layout: z.enum(LAYOUTS).optional().catch(undefined),
  sort: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  category: z.array(z.string()).optional().catch(undefined),
  status: z.array(z.enum(STATUSES)).optional().catch(undefined),
  favorites: z.boolean().optional().catch(undefined),
  provider: z.array(z.string()).optional().catch(undefined),
});

/** A malformed link falls back to the matching field instead of failing the route. */
export function parseLibraryRouteSearch(search: Record<string, unknown>): LibraryRouteSearch {
  return libraryRouteSearchSchema.parse(search);
}

function parseLibrarySort(value: string | undefined): LibrarySort {
  if (value !== undefined) {
    const [key, direction] = value.split(':');
    if (
      SORT_KEYS.includes(key as LibrarySortKey) &&
      SORT_DIRECTIONS.includes(direction as LibrarySortDirection)
    ) {
      return { key: key as LibrarySortKey, direction: direction as LibrarySortDirection };
    }
  }
  return DEFAULT_LIBRARY_VIEW_STATE.sort;
}

function filterFromSearch(search: LibraryRouteSearch): LibraryFilter {
  const query = search.q;
  return {
    ...(query !== undefined && query.trim().length > 0 ? { query } : {}),
    ...(search.category !== undefined && search.category.length > 0
      ? { categoryIds: search.category.map((id) => toCategoryId(id)) }
      : {}),
    ...(search.status !== undefined && search.status.length > 0 ? { statuses: search.status } : {}),
    ...(search.favorites === true ? { favoritesOnly: true } : {}),
    ...(search.provider !== undefined && search.provider.length > 0
      ? { providerIds: search.provider.map((id) => toProviderId(id)) }
      : {}),
  };
}

/** Reads the restorable view. Missing params are the defaults, not an empty library. */
export function libraryViewStateFromSearch(search: LibraryRouteSearch): LibraryViewState {
  return {
    layout: search.layout ?? DEFAULT_LIBRARY_VIEW_STATE.layout,
    sort: parseLibrarySort(search.sort),
    filter: filterFromSearch(search),
  };
}

/**
 * Writes only the non-default fields, so a plain `/library` stays clean and a
 * restored view is byte-for-byte the same URL the toolbar produced.
 */
export function librarySearchFromViewState(viewState: LibraryViewState): LibraryRouteSearch {
  const defaultSort = DEFAULT_LIBRARY_VIEW_STATE.sort;
  const { layout, sort, filter } = viewState;
  return {
    ...(layout !== DEFAULT_LIBRARY_VIEW_STATE.layout ? { layout } : {}),
    ...(sort.key !== defaultSort.key || sort.direction !== defaultSort.direction
      ? { sort: `${sort.key}:${sort.direction}` }
      : {}),
    ...(filter.query !== undefined && filter.query.trim().length > 0 ? { q: filter.query } : {}),
    ...(filter.categoryIds !== undefined && filter.categoryIds.length > 0
      ? { category: [...filter.categoryIds] }
      : {}),
    ...(filter.statuses !== undefined && filter.statuses.length > 0
      ? { status: [...filter.statuses] }
      : {}),
    ...(filter.favoritesOnly === true ? { favorites: true } : {}),
    ...(filter.providerIds !== undefined && filter.providerIds.length > 0
      ? { provider: [...filter.providerIds] }
      : {}),
  };
}
