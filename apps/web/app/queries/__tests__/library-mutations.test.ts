import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_LIBRARY_VIEW_STATE,
  libraryQueryKeys,
  type MangaDetailData,
} from '@/features/library';
import {
  toCategoryId,
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  toProviderMappingId,
} from '@app/shared';
import {
  createAddToLibraryMutationOptions,
  createLibraryOrganizationMutationOptions,
  createRemoveFromLibraryMutationOptions,
  createToggleFavoriteMutationOptions,
} from '../library-mutation-options.js';

const mangaId = toMangaId('manga-mutation-1');
const otherMangaId = toMangaId('manga-mutation-2');
const newEntryId = toLibraryEntryId('entry-client-generated');

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

const otherDetailData: MangaDetailData = {
  ...detailData,
  manga: {
    ...detailData.manga,
    id: otherMangaId,
    canonicalTitle: 'Other Mutation Manga',
  },
};

function seedPage(queryClient: QueryClient) {
  const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
  queryClient.setQueryData(pageKey, {
    items: [],
    categories: [],
    viewState: DEFAULT_LIBRARY_VIEW_STATE,
  });
  queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);
  queryClient.setQueryData(libraryQueryKeys.detail(otherMangaId), otherDetailData);
  return pageKey;
}

function seedExistingEntry(queryClient: QueryClient) {
  const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
  const entry = {
    id: toLibraryEntryId('entry-existing'),
    mangaId,
    favorite: false,
    categoryIds: [],
    status: 'planned' as const,
    unreadCount: 0,
  };
  queryClient.setQueryData(pageKey, {
    items: [{ entry, manga: detailData.manga }],
    categories: [],
    viewState: DEFAULT_LIBRARY_VIEW_STATE,
  });
  queryClient.setQueryData(libraryQueryKeys.detail(mangaId), {
    ...detailData,
    libraryEntry: entry,
  });
  return pageKey;
}

describe('library mutation options', () => {
  it('uses the client-generated id and rolls back only the failed add', async () => {
    const queryClient = new QueryClient();
    const pageKey = seedPage(queryClient);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const options = createAddToLibraryMutationOptions(null, queryClient, mangaId);
    await options.onMutate?.(newEntryId);

    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      items: [{ entry: { id: newEntryId, mangaId } }],
    });

    options.onError?.(new Error('db unavailable'));
    expect(queryClient.getQueryData(pageKey)).toMatchObject({ items: [] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.all });
  });

  it('does not clobber a concurrent optimistic add when one fails', async () => {
    const queryClient = new QueryClient();
    const pageKey = seedPage(queryClient);

    const first = createAddToLibraryMutationOptions(null, queryClient, mangaId);
    const second = createAddToLibraryMutationOptions(null, queryClient, otherMangaId);
    const firstId = toLibraryEntryId('entry-first');
    const secondId = toLibraryEntryId('entry-second');

    await first.onMutate?.(firstId);
    await second.onMutate?.(secondId);
    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      items: [{ entry: { id: firstId } }, { entry: { id: secondId } }],
    });

    first.onError?.(new Error('first failed'));
    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      items: [{ entry: { id: secondId } }],
    });
  });

  it('rolls back the optimistic remove by refetching, not by restoring a page snapshot', async () => {
    const queryClient = new QueryClient();
    const pageKey = seedExistingEntry(queryClient);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const options = createRemoveFromLibraryMutationOptions({} as never, queryClient, mangaId);
    await options.onMutate?.();
    expect(queryClient.getQueryData(pageKey)).toMatchObject({ items: [] });

    options.onError?.(new Error('failed'));
    expect(queryClient.getQueryData(pageKey)).toMatchObject({ items: [] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.all });
  });

  it('rolls back the optimistic favorite by refetching, not by restoring a page snapshot', async () => {
    const queryClient = new QueryClient();
    const pageKey = seedExistingEntry(queryClient);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const options = createToggleFavoriteMutationOptions({} as never, queryClient, mangaId);
    await options.onMutate?.(true);
    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      items: [{ entry: { favorite: true } }],
    });

    options.onError?.(new Error('failed'), true);
    // The rollback is the invalidation refetch, not a page snapshot: the
    // optimistic flag must still be there for the refetch to correct.
    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      items: [{ entry: { favorite: true } }],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.all });
  });

  it('applies category pinning optimistically before the refetch', async () => {
    const queryClient = new QueryClient();
    const pageKey = libraryQueryKeys.page(DEFAULT_LIBRARY_VIEW_STATE);
    const categoryId = toCategoryId('category-pin');
    queryClient.setQueryData(pageKey, {
      items: [],
      categories: [{ id: categoryId, name: 'Pinned' }],
      viewState: DEFAULT_LIBRARY_VIEW_STATE,
    });

    const options = createLibraryOrganizationMutationOptions(null, queryClient);
    await options.onMutate?.({ type: 'set_category_pinned', categoryId, pinned: true });

    expect(queryClient.getQueryData(pageKey)).toMatchObject({
      categories: [{ id: categoryId, pinned: true }],
    });
  });

  it('invalidates library queries after settled mutations', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const db = {} as never;

    createAddToLibraryMutationOptions(db, queryClient, mangaId).onSettled?.();
    createRemoveFromLibraryMutationOptions(db, queryClient, mangaId).onSettled?.();
    createToggleFavoriteMutationOptions(db, queryClient, mangaId).onSettled?.();
    createLibraryOrganizationMutationOptions(db, queryClient).onSettled?.();

    expect(invalidateSpy).toHaveBeenCalledTimes(4);
  });
});
