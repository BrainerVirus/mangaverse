import type {
  LibraryCategory,
  LibraryEntry,
  LibraryEntryId,
  LibraryStatus,
  MangaId,
  MangaIdentity,
} from '@app/shared';
import { compareLibraryCategories } from '@app/shared';
import type {
  LibraryItem,
  LibraryPageData,
  LibraryOrganizationAction,
  MangaDetailData,
} from './types.js';
import { libraryQueryKeys } from './query-keys.js';

export interface QueryCacheReader {
  getQueriesData<T>(filters: {
    queryKey: readonly unknown[];
  }): Array<[readonly unknown[], T | undefined]>;
  setQueryData<T>(queryKey: readonly unknown[], data: T | undefined): void;
}

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

function patchPageData(
  page: LibraryPageData,
  updater: (items: readonly LibraryItem[]) => readonly LibraryItem[],
): LibraryPageData {
  return {
    ...page,
    items: updater(page.items),
  };
}

function matchesFavoritesFilter(page: LibraryPageData, favorite: boolean): boolean {
  return page.viewState.filter.favoritesOnly !== true || favorite;
}

function isLibraryPageQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === libraryQueryKeys.all[0] && queryKey[1] === 'page';
}

function isLibraryDetailQueryKey(queryKey: readonly unknown[], mangaId: MangaId): boolean {
  return (
    queryKey[0] === libraryQueryKeys.all[0] && queryKey[1] === 'detail' && queryKey[2] === mangaId
  );
}

function getLibraryPageQueries(
  queryClient: QueryCacheReader,
): Array<[readonly unknown[], LibraryPageData | undefined]> {
  return queryClient
    .getQueriesData<LibraryPageData>({ queryKey: libraryQueryKeys.all })
    .filter(([queryKey]) => isLibraryPageQueryKey(queryKey));
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

  for (const [queryKey, page] of getLibraryPageQueries(queryClient)) {
    if (page === undefined) continue;
    if (page.items.some((item) => item.entry.mangaId === mangaId)) continue;

    queryClient.setQueryData(
      queryKey,
      patchPageData(page, (items) => [...items, optimisticItem]),
    );
  }

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
  for (const [queryKey, page] of getLibraryPageQueries(queryClient)) {
    if (page === undefined) continue;
    queryClient.setQueryData(
      queryKey,
      patchPageData(page, (items) => items.filter((item) => item.entry.mangaId !== mangaId)),
    );
  }

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
  for (const [queryKey, page] of getLibraryPageQueries(queryClient)) {
    if (page === undefined) continue;

    if (!matchesFavoritesFilter(page, favorite)) {
      queryClient.setQueryData(
        queryKey,
        patchPageData(page, (items) => items.filter((item) => item.entry.mangaId !== mangaId)),
      );
      continue;
    }

    queryClient.setQueryData(
      queryKey,
      patchPageData(page, (items) =>
        items.map((item) =>
          item.entry.mangaId === mangaId ? { ...item, entry: { ...item.entry, favorite } } : item,
        ),
      ),
    );
  }

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

function isEntryAction(action: LibraryOrganizationAction): boolean {
  return (
    action.type !== 'create_category' &&
    action.type !== 'reorder_categories' &&
    action.type !== 'rename_category' &&
    action.type !== 'delete_category' &&
    action.type !== 'set_category_pinned'
  );
}

function entryMatchesPageFilter(page: LibraryPageData, item: LibraryItem): boolean {
  const filter = page.viewState.filter;
  if (filter.favoritesOnly === true && !item.entry.favorite) return false;
  if (filter.statuses !== undefined && filter.statuses.length > 0) {
    if (!filter.statuses.includes(item.entry.status)) return false;
  }
  if (filter.categoryIds !== undefined && filter.categoryIds.length > 0) {
    const categoryIds = new Set(filter.categoryIds);
    if (!item.entry.categoryIds.some((id) => categoryIds.has(id))) return false;
  }
  if (filter.providerIds !== undefined && filter.providerIds.length > 0) {
    const providerIds = new Set(filter.providerIds);
    if (!item.manga.providerMappings.some((mapping) => providerIds.has(mapping.providerId))) {
      return false;
    }
  }
  return true;
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

  for (const [queryKey, page] of getLibraryPageQueries(queryClient)) {
    if (page === undefined) continue;
    const categories = applyCategoryAction(page.categories, action);
    const items = isEntryAction(action)
      ? page.items
          .map((item) =>
            targetedEntryIds.has(item.entry.id)
              ? { ...item, entry: mutatedEntry(item.entry, action) }
              : item,
          )
          .filter((item) => entryMatchesPageFilter(page, item))
      : page.items;
    queryClient.setQueryData(queryKey, {
      ...page,
      categories: categories ?? page.categories,
      items,
    });
  }

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
