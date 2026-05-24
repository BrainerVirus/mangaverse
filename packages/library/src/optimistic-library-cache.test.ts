import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { toMangaId, toProviderId, toProviderMappingId } from '@app/shared';
import { DEFAULT_LIBRARY_VIEW_STATE } from './view-state.js';
import { libraryQueryKeys } from './query-keys.js';
import type { LibraryPageData, MangaDetailData } from './types.js';
import {
  optimisticallyAddMangaToLibrary,
  optimisticallyRemoveMangaFromLibrary,
  optimisticallySetMangaFavorite,
  restoreLibraryCache,
  snapshotLibraryCache,
} from './optimistic-library-cache.js';

const mangaId = toMangaId('manga-1');

const manga = {
  id: mangaId,
  canonicalTitle: 'Optimistic Manga',
  alternativeTitles: [],
  authors: [],
  artists: [],
  tags: [],
  status: 'ongoing' as const,
  contentRating: 'safe' as const,
  providerMappings: [
    {
      id: toProviderMappingId('mapping-1'),
      providerId: toProviderId('prov-a'),
      providerMangaId: 'remote-1',
      language: 'en',
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

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, 'planned');

    const updatedPage = queryClient.getQueryData<LibraryPageData>(pageKey);
    expect(updatedPage?.items).toHaveLength(1);
    expect(updatedPage?.items[0]?.entry.status).toBe('planned');

    const updatedDetail = queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId));
    expect(updatedDetail?.libraryEntry?.mangaId).toBe(mangaId);
  });

  it('removes manga from cached library pages and detail queries', () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga);

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

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga);
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
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga);

    queryClient.setQueryData(pageKey, {
      ...pageData,
      viewState: favoritesView,
      items: queryClient.getQueryData<LibraryPageData>(defaultPageKey)!.items,
    });

    optimisticallySetMangaFavorite(queryClient, mangaId, false);

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items).toHaveLength(0);
  });

  it('restores previous cache snapshots on rollback', () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, pageData);
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);

    const snapshot = snapshotLibraryCache(queryClient, mangaId);
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga);
    restoreLibraryCache(queryClient, snapshot);

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items).toHaveLength(0);
    expect(
      queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId))?.libraryEntry,
    ).toBeUndefined();
  });
});
