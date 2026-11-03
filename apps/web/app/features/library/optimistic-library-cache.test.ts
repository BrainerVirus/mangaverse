// @vitest-environment node
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
  total: 0,
  categories: [],
  viewState: DEFAULT_LIBRARY_VIEW_STATE,
};

const detailData: MangaDetailData = {
  manga,
  chapters: [],
  libraryEntry: undefined,
  continueChapterId: undefined,
};

function detailClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);
  return queryClient;
}

const detailOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId));

describe('optimistic-library-cache', () => {
  it('adds manga to the detail query', () => {
    const queryClient = detailClient();

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId), 'planned');

    expect(detailOf(queryClient)?.libraryEntry?.status).toBe('planned');
    expect(detailOf(queryClient)?.libraryEntry?.mangaId).toBe(mangaId);
  });

  it('removes manga from the detail query', () => {
    const queryClient = detailClient();
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));

    optimisticallyRemoveMangaFromLibrary(queryClient, mangaId);

    expect(detailOf(queryClient)?.libraryEntry).toBeUndefined();
  });

  it('updates favorite state on the detail entry', () => {
    const queryClient = detailClient();
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));

    optimisticallySetMangaFavorite(queryClient, mangaId, true);

    expect(detailOf(queryClient)?.libraryEntry?.favorite).toBe(true);
  });

  it('leaves the grid query cache alone: the grid is fed by host collections', () => {
    const queryClient = detailClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, pageData);

    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));

    expect(queryClient.getQueryData<LibraryPageData>(pageKey)?.items).toHaveLength(0);
  });
});

describe('optimistic library organization', () => {
  it('applies category assignments and status to the detail entry', () => {
    const queryClient = detailClient();
    optimisticallyAddMangaToLibrary(queryClient, mangaId, manga, entryIdFor(mangaId));

    const categoryId = toCategoryId('category-1');
    optimisticallyApplyLibraryOrganizationAction(queryClient, {
      type: 'add_entry_categories',
      entryIds: [entryIdFor(mangaId)],
      categoryIds: [categoryId],
    });

    expect(detailOf(queryClient)?.libraryEntry?.categoryIds).toEqual([categoryId]);

    optimisticallyApplyLibraryOrganizationAction(queryClient, {
      type: 'set_entries_status',
      entryIds: [entryIdFor(mangaId)],
      status: 'completed',
    });
    expect(detailOf(queryClient)?.libraryEntry?.status).toBe('completed');
  });

  it('patches pinned category state on the detail categories', () => {
    const queryClient = new QueryClient();
    const categoryId = toCategoryId('category-1');
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), {
      ...detailData,
      categories: [{ id: categoryId, name: 'Action' }],
    });

    optimisticallyApplyLibraryOrganizationAction(queryClient, {
      type: 'set_category_pinned',
      categoryId,
      pinned: true,
    });

    expect(detailOf(queryClient)?.categories?.[0]?.pinned).toBe(true);
  });
});
