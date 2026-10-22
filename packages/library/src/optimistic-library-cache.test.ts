import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  toCategoryId,
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  toProviderMangaId,
  toProviderMappingId,
} from '@app/shared';
import type { MangaIdentity } from '@app/shared';
import { DEFAULT_LIBRARY_VIEW_STATE } from './view-state.js';
import { libraryQueryKeys } from './query-keys.js';
import type { LibraryPageData, MangaDetailData } from './types.js';
import {
  optimisticallyAddMangaToLibrary,
  optimisticallyApplyLibraryOrganizationAction,
  optimisticallyRemoveMangaFromLibrary,
  optimisticallySetMangaFavorite,
} from './optimistic-library-cache.js';

const mangaId = toMangaId('manga-1');
const entryIdFor = (id: string) => toLibraryEntryId(`entry-${id}`);

const manga: MangaIdentity = {
  id: mangaId,
  canonicalTitle: 'Optimistic Manga',
  alternativeTitles: [],
  authors: [],
  artists: [],
  tags: [],
  status: 'ongoing',
  contentRating: 'safe',
  providerMappings: [
    {
      id: toProviderMappingId('mapping-1'),
      providerId: toProviderId('prov-a'),
      providerMangaId: toProviderMangaId('remote-1'),
    },
  ],
  defaultProviderMappingId: toProviderMappingId('mapping-1'),
  merged: false,
};

const pageData: LibraryPageData = {
  items: [],
  categories: [],
  viewState: DEFAULT_LIBRARY_VIEW_STATE,
};

const detailData: MangaDetailData = {
  manga,
  chapters: [],
  libraryEntry: undefined,
  continueChapterId: undefined,
};

describe('optimistic-library-cache', () => {
  it('adds manga to cached library pages and detail queries', () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId), 'planned');

    const updatedPage = queryClient.getQueryData<LibraryPageData>(pageKey);
    expect(updatedPage?.items).toHaveLength(1);
    expect(updatedPage?.items[0]?.entry.status).toBe('planned');

    const updatedDetail = queryClient.getQueryData<MangaDetailData>(
      libraryQueryKeys.detail(mangaId),
    );
    expect(updatedDetail?.libraryEntry?.mangaId).toBe(mangaId);
  });

  it('removes manga from cached library pages and detail queries', () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));

    optimisticallyRemoveMangaFromLibrary(queryClient, mangaId);

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items).toHaveLength(0);
    expect(
      queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId))?.libraryEntry,
    ).toBeUndefined();
  });

  it('updates favorite state across cached queries', () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));
    optimisticallySetMangaFavorite(queryClient, mangaId, true);
    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items[0]?.entry.favorite).toBe(true);
    expect(
      queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId))?.libraryEntry
        ?.favorite,
    ).toBe(true);
  });

  it('removes non-favorites from favorites-only cached pages', () => {
    const queryClient = new QueryClient();
    const favoritesView = {
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: { favoritesOnly: true },
    };
    const pageKey = libraryQueryKeys.page(favoritesView);
    const defaultPageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);

    queryClient.setQueryData(defaultPageKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));

    queryClient.setQueryData(pageKey, {
      ...pageData,
      viewState: favoritesView,
      items: queryClient.getQueryData<LibraryPageData>(defaultPageKey)!.items,
    });

    optimisticallySetMangaFavorite(queryClient, mangaId, false);

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items).toHaveLength(0);
  });
});

describe('optimistic library organization', () => {
  it('applies category assignments and status to cached pages and the detail entry', () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));

    const categoryId = toCategoryId('category-1');
    optimisticallyApplyLibraryOrganizationAction(queryClient, {
      type: 'add_entry_categories',
      entryIds: [entryIdFor(mangaId)],
      categoryIds: [categoryId],
    });

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items[0]?.entry.categoryIds).toEqual(
      [categoryId],
    );
    expect(
      queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId))?.libraryEntry
        ?.categoryIds,
    ).toEqual([categoryId]);

    optimisticallyApplyLibraryOrganizationAction(queryClient, {
      type: 'set_entries_status',
      entryIds: [entryIdFor(mangaId)],
      status: 'completed',
    });
    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items[0]?.entry.status).toBe(
      'completed',
    );
  });

  it('drops an optimistic entry when the active filter no longer matches', () => {
    const queryClient = new QueryClient();
    const favoritesView = {
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: { favoritesOnly: true },
    };
    const pageKey = libraryQueryKeys.page(favoritesView);
    const defaultKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(defaultKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));
    queryClient.setQueryData(pageKey, {
      ...pageData,
      viewState: favoritesView,
      items: queryClient.getQueryData<LibraryPageData>(defaultKey)!.items,
    });

    optimisticallyApplyLibraryOrganizationAction(queryClient, {
      type: 'set_entries_favorite',
      entryIds: [entryIdFor(mangaId)],
      favorite: false,
    });

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items).toHaveLength(0);
  });

  it('patches pinned category state on cached pages', () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    const categoryId = toCategoryId('category-1');
    queryClient.setQueryData(pageKey, {
      ...pageData,
      categories: [{ id: categoryId, name: 'Action' }],
    });

    optimisticallyApplyLibraryOrganizationAction(queryClient, {
      type: 'set_category_pinned',
      categoryId,
      pinned: true,
    });

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.categories[0]?.pinned).toBe(true);
  });
});
