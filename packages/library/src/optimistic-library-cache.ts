import type {
  LibraryEntry,
  LibraryStatus,
  MangaId,
  MangaIdentity,
} from '@app/shared';
import { toLibraryEntryId } from '@app/shared';
import type { LibraryItem, LibraryPageData, MangaDetailData } from './types.js';
import { libraryQueryKeys } from './query-keys.js';

export interface LibraryCacheSnapshot {
  readonly pages: ReadonlyArray<readonly [readonly unknown[], LibraryPageData | undefined]>;
  readonly details: ReadonlyArray<readonly [readonly unknown[], MangaDetailData | undefined]>;
}

export interface QueryCacheReader {
  getQueriesData<T>(filters: { queryKey: readonly unknown[] }): Array<[readonly unknown[], T | undefined]>;
  setQueryData<T>(queryKey: readonly unknown[], data: T | undefined): void;
}

function createOptimisticEntry(
  mangaId: MangaId,
  manga: MangaIdentity,
  status: LibraryStatus,
  favorite = false,
): LibraryItem {
  const now = new Date().toISOString();
  const entry: LibraryEntry = {
    id: toLibraryEntryId(`optimistic-${mangaId}`),
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
  return queryKey[0] === libraryQueryKeys.all[0] && queryKey[1] === 'detail' && queryKey[2] === mangaId;
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

export function snapshotLibraryCache(
  queryClient: QueryCacheReader,
  mangaId: MangaId,
): LibraryCacheSnapshot {
  return {
    pages: getLibraryPageQueries(queryClient),
    details: getLibraryDetailQueries(queryClient, mangaId),
  };
}

export function restoreLibraryCache(
  queryClient: QueryCacheReader,
  snapshot: LibraryCacheSnapshot,
): void {
  for (const [queryKey, data] of snapshot.pages) {
    queryClient.setQueryData(queryKey, data);
  }
  for (const [queryKey, data] of snapshot.details) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function optimisticallyAddMangaToLibrary(
  queryClient: QueryCacheReader,
  mangaId: MangaId,
  manga: MangaIdentity,
  status: LibraryStatus = 'planned',
): void {
  const optimisticItem = createOptimisticEntry(mangaId, manga, status);

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
        patchPageData(page, (items) =>
          items.filter((item) => item.entry.mangaId !== mangaId),
        ),
      );
      continue;
    }

    queryClient.setQueryData(
      queryKey,
      patchPageData(page, (items) =>
        items.map((item) =>
          item.entry.mangaId === mangaId
            ? { ...item, entry: { ...item.entry, favorite } }
            : item,
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
