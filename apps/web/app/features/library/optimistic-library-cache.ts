import type {
  LibraryCategory,
  LibraryEntry,
  LibraryEntryId,
  LibraryStatus,
  MangaId,
  MangaIdentity,
} from '@app/shared';
import { compareLibraryCategories } from '@app/shared';
import type { LibraryItem, LibraryOrganizationAction, MangaDetailData } from './types.js';
import { libraryQueryKeys } from './query-keys.js';

export interface QueryCacheReader {
  getQueriesData<T>(filters: {
    queryKey: readonly unknown[];
  }): Array<[readonly unknown[], T | undefined]>;
  setQueryData<T>(queryKey: readonly unknown[], data: T | undefined): void;
}

/**
 * The library grid is fed by host collections (#210), not by a query cache, so these
 * helpers only patch the manga detail query that mounted the write. They must not pretend
 * to update a page: a page cache they could not keep `total` in step with is never read.
 */
function createOptimisticEntry(
  mangaId: MangaId,
  manga: MangaIdentity,
  status: LibraryStatus,
  entryId: LibraryEntryId,
  favorite = false,
): LibraryItem {
  const now = new Date().toISOString();
  const entry: LibraryEntry = {
    id: entryId,
    mangaId,
    favorite,
    categoryIds: [],
    status,
    unreadCount: 0,
    addedAt: now,
    updatedAt: now,
  };
  return { entry, manga };
}

function isLibraryDetailQueryKey(queryKey: readonly unknown[], mangaId: MangaId): boolean {
  return (
    queryKey[0] === libraryQueryKeys.all[0] && queryKey[1] === 'detail' && queryKey[2] === mangaId
  );
}

function getLibraryDetailQueries(
  queryClient: QueryCacheReader,
  mangaId: MangaId,
): Array<[readonly unknown[], MangaDetailData | undefined]> {
  return queryClient
    .getQueriesData<MangaDetailData>({ queryKey: libraryQueryKeys.all })
    .filter(([queryKey]) => isLibraryDetailQueryKey(queryKey, mangaId));
}

function getAllLibraryDetailQueries(
  queryClient: QueryCacheReader,
): Array<[readonly unknown[], MangaDetailData | undefined]> {
  return queryClient
    .getQueriesData<MangaDetailData>({ queryKey: libraryQueryKeys.all })
    .filter(([queryKey]) => queryKey[0] === libraryQueryKeys.all[0] && queryKey[1] === 'detail');
}

export function optimisticallyAddMangaToLibrary(
  queryClient: QueryCacheReader,
  mangaId: MangaId,
  manga: MangaIdentity,
  entryId: LibraryEntryId,
  status: LibraryStatus = 'planned',
): void {
  const optimisticItem = createOptimisticEntry(mangaId, manga, status, entryId);
  for (const [queryKey, detail] of getLibraryDetailQueries(queryClient, mangaId)) {
    if (detail === undefined) continue;
    queryClient.setQueryData(queryKey, {
      ...detail,
      libraryEntry: optimisticItem.entry,
    });
  }
}

export function optimisticallyRemoveMangaFromLibrary(
  queryClient: QueryCacheReader,
  mangaId: MangaId,
): void {
  for (const [queryKey, detail] of getLibraryDetailQueries(queryClient, mangaId)) {
    if (detail === undefined) continue;
    queryClient.setQueryData(queryKey, {
      ...detail,
      libraryEntry: undefined,
    });
  }
}

export function optimisticallySetMangaFavorite(
  queryClient: QueryCacheReader,
  mangaId: MangaId,
  favorite: boolean,
): void {
  for (const [queryKey, detail] of getLibraryDetailQueries(queryClient, mangaId)) {
    if (detail === undefined || detail.libraryEntry === undefined) continue;
    queryClient.setQueryData(queryKey, {
      ...detail,
      libraryEntry: { ...detail.libraryEntry, favorite },
    });
  }
}

function mutatedEntry(entry: LibraryEntry, action: LibraryOrganizationAction): LibraryEntry {
  switch (action.type) {
    case 'set_entry_categories':
      return { ...entry, categoryIds: [...action.categoryIds] };
    case 'add_entry_categories':
      return {
        ...entry,
        categoryIds: [...new Set([...entry.categoryIds, ...action.categoryIds])],
      };
    case 'remove_entry_categories': {
      const removed = new Set(action.categoryIds);
      return {
        ...entry,
        categoryIds: entry.categoryIds.filter((id) => !removed.has(id)),
      };
    }
    case 'set_entries_status':
      return { ...entry, status: action.status };
    case 'set_entries_favorite':
      return { ...entry, favorite: action.favorite };
    default:
      return entry;
  }
}

function applyCategoryAction(
  categories: readonly LibraryCategory[] | undefined,
  action: LibraryOrganizationAction,
): readonly LibraryCategory[] | undefined {
  if (categories === undefined) return undefined;
  let next: LibraryCategory[] = [...categories];
  if (action.type === 'rename_category') {
    next = next.map((category) => {
      if (category.id !== action.categoryId) return category;
      const color = action.color?.trim();
      if (color !== undefined && color.length > 0) {
        return { ...category, name: action.name.trim(), color };
      }
      const withoutColor = { ...category };
      delete withoutColor.color;
      return { ...withoutColor, name: action.name.trim() };
    });
  } else if (action.type === 'delete_category') {
    next = next.filter((category) => category.id !== action.categoryId);
  } else if (action.type === 'set_category_pinned') {
    next = next.map((category) =>
      category.id === action.categoryId ? { ...category, pinned: action.pinned } : category,
    );
  } else if (action.type === 'reorder_categories') {
    const positions = new Map(action.categoryIds.map((id, index) => [id, index]));
    next = next.map((category) => {
      const sortIndex = positions.get(category.id);
      return sortIndex === undefined ? category : { ...category, sortIndex };
    });
  }
  return next.sort(compareLibraryCategories);
}

export function optimisticallyApplyLibraryOrganizationAction(
  queryClient: QueryCacheReader,
  action: LibraryOrganizationAction,
): void {
  const targetedEntryIds = 'entryIds' in action ? new Set(action.entryIds) : new Set<string>();

  for (const [queryKey, detail] of getAllLibraryDetailQueries(queryClient)) {
    if (detail === undefined) continue;
    const categories = applyCategoryAction(detail.categories, action);
    const libraryEntry =
      detail.libraryEntry !== undefined && targetedEntryIds.has(detail.libraryEntry.id)
        ? mutatedEntry(detail.libraryEntry, action)
        : detail.libraryEntry;
    queryClient.setQueryData(queryKey, {
      ...detail,
      libraryEntry,
      ...(categories === undefined ? {} : { categories }),
    });
  }
}
