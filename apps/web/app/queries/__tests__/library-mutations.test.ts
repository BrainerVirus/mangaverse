import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_LIBRARY_VIEW_STATE,
  libraryQueryKeys,
  type MangaDetailData,
} from '@app/library';
import { toMangaId, toProviderId, toProviderMappingId } from '@app/shared';
import {
  createAddToLibraryMutationOptions,
  createRemoveFromLibraryMutationOptions,
  createToggleFavoriteMutationOptions,
} from '../library-mutation-options.js';

const mangaId = toMangaId('manga-mutation-1');

const detailData: MangaDetailData = {
  manga: {
    id: mangaId,
    canonicalTitle: 'Mutation Manga',
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
        providerMangaId: 'remote-1',
        language: 'en',
      },
    ],
    defaultProviderMappingId: toProviderMappingId('mapping-1'),
    merged: false,
  },
  chapters: [],
  libraryEntry: undefined,
  continueChapterId: undefined,
};

describe('library mutation options', () => {
  it('rolls back optimistic add on mutation failure', async () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, {
      items: [],
      categories: [],
      viewState: DEFAULT_LIBRARY_VIEW_STATE,
    });
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);

    const options = createAddToLibraryMutationOptions(null, queryClient, mangaId);
    const context = await options.onMutate?.();

    expect(queryClient.getQueryData(pageKey)).toMatchObject({ items: [{ entry: { mangaId } }] });

    options.onError?.(new Error('db unavailable'), undefined, context);
    expect(queryClient.getQueryData(pageKey)).toMatchObject({ items: [] });
  });

  it('rolls back optimistic remove on mutation failure', async () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, {
      items: [
        {
          entry: {
            id: 'entry-1',
            mangaId,
            favorite: false,
            categoryIds: [],
            status: 'planned',
            unreadCount: 0,
          },
          manga: detailData.manga,
        },
      ],
      categories: [],
      viewState: DEFAULT_LIBRARY_VIEW_STATE,
    });
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), {
      ...detailData,
      libraryEntry: {
        id: 'entry-1',
        mangaId,
        favorite: false,
        categoryIds: [],
        status: 'planned',
        unreadCount: 0,
      },
    });

    const options = createRemoveFromLibraryMutationOptions({} as never, queryClient, mangaId);
    const context = await options.onMutate?.();
    expect(queryClient.getQueryData(pageKey)).toMatchObject({ items: [] });

    options.onError?.(new Error('failed'), undefined, context);
    expect(queryClient.getQueryData(pageKey)).toMatchObject({ items: [{ entry: { mangaId } }] });
  });

  it('rolls back optimistic favorite toggle on mutation failure', async () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    queryClient.setQueryData(pageKey, {
      items: [
        {
          entry: {
            id: 'entry-1',
            mangaId,
            favorite: false,
            categoryIds: [],
            status: 'planned',
            unreadCount: 0,
          },
          manga: detailData.manga,
        },
      ],
      categories: [],
      viewState: DEFAULT_LIBRARY_VIEW_STATE,
    });
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), {
      ...detailData,
      libraryEntry: {
        id: 'entry-1',
        mangaId,
        favorite: false,
        categoryIds: [],
        status: 'planned',
        unreadCount: 0,
      },
    });

    const options = createToggleFavoriteMutationOptions({} as never, queryClient, mangaId);
    const context = await options.onMutate?.(true);
    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      items: [{ entry: { favorite: true } }],
    });

    options.onError?.(new Error('failed'), true, context);
    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      items: [{ entry: { favorite: false } }],
    });
  });

  it('invalidates library queries after settled mutations', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const db = {} as never;

    createAddToLibraryMutationOptions(db, queryClient, mangaId).onSettled?.();
    createRemoveFromLibraryMutationOptions(db, queryClient, mangaId).onSettled?.();
    createToggleFavoriteMutationOptions(db, queryClient, mangaId).onSettled?.();

    expect(invalidateSpy).toHaveBeenCalled();
  });
});
