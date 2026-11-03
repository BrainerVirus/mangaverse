import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { libraryQueryKeys, type MangaDetailData } from '@/features/library';
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
const existingEntryId = toLibraryEntryId('entry-existing');

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

const detailOf = (queryClient: QueryClient, id = mangaId) =>
  queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(id));

/** Detail caches only: the library grid now reads host collections, not a page query. */
function seedDetails(queryClient: QueryClient): void {
  queryClient.setQueryData(libraryQueryKeys.detail(mangaId), detailData);
  queryClient.setQueryData(libraryQueryKeys.detail(otherMangaId), otherDetailData);
}

function seedExistingEntry(queryClient: QueryClient): void {
  seedDetails(queryClient);
  queryClient.setQueryData(libraryQueryKeys.detail(mangaId), {
    ...detailData,
    libraryEntry: {
      id: existingEntryId,
      mangaId,
      favorite: false,
      categoryIds: [],
      status: 'planned' as const,
      unreadCount: 0,
    },
  });
}

describe('library mutation options', () => {
  it('uses the client-generated id and rolls back only the failed add', async () => {
    const queryClient = new QueryClient();
    seedDetails(queryClient);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const options = createAddToLibraryMutationOptions(null, queryClient, mangaId);
    await options.onMutate?.(newEntryId);

    expect(detailOf(queryClient)?.libraryEntry).toMatchObject({ id: newEntryId, mangaId });

    options.onError?.(new Error('db unavailable'));
    expect(detailOf(queryClient)?.libraryEntry).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.all });
  });

  it('does not clobber a concurrent optimistic add when one fails', async () => {
    const queryClient = new QueryClient();
    seedDetails(queryClient);

    const first = createAddToLibraryMutationOptions(null, queryClient, mangaId);
    const second = createAddToLibraryMutationOptions(null, queryClient, otherMangaId);
    const firstId = toLibraryEntryId('entry-first');
    const secondId = toLibraryEntryId('entry-second');

    await first.onMutate?.(firstId);
    await second.onMutate?.(secondId);
    expect(detailOf(queryClient)?.libraryEntry?.id).toBe(firstId);
    expect(detailOf(queryClient, otherMangaId)?.libraryEntry?.id).toBe(secondId);

    first.onError?.(new Error('first failed'));
    expect(detailOf(queryClient)?.libraryEntry).toBeUndefined();
    expect(detailOf(queryClient, otherMangaId)?.libraryEntry?.id).toBe(secondId);
  });

  it('clears the optimistic remove and relies on the refetch to restore it', async () => {
    const queryClient = new QueryClient();
    seedExistingEntry(queryClient);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const options = createRemoveFromLibraryMutationOptions({} as never, queryClient, mangaId);
    await options.onMutate?.();
    expect(detailOf(queryClient)?.libraryEntry).toBeUndefined();

    options.onError?.(new Error('failed'));
    expect(detailOf(queryClient)?.libraryEntry).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.all });
  });

  it('rolls back the optimistic favorite by refetching, not by restoring a snapshot', async () => {
    const queryClient = new QueryClient();
    seedExistingEntry(queryClient);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const options = createToggleFavoriteMutationOptions({} as never, queryClient, mangaId);
    await options.onMutate?.(true);
    expect(detailOf(queryClient)?.libraryEntry?.favorite).toBe(true);

    options.onError?.(new Error('failed'), true);
    // The rollback is the invalidation refetch, not a snapshot: the optimistic flag
    // must still be there for the refetch to correct.
    expect(detailOf(queryClient)?.libraryEntry?.favorite).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryQueryKeys.all });
  });

  it('applies category pinning optimistically before the refetch', async () => {
    const queryClient = new QueryClient();
    const categoryId = toCategoryId('category-pin');
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), {
      ...detailData,
      categories: [{ id: categoryId, name: 'Pinned' }],
    });

    const options = createLibraryOrganizationMutationOptions(null, queryClient);
    await options.onMutate?.({ type: 'set_category_pinned', categoryId, pinned: true });

    expect(detailOf(queryClient)?.categories).toMatchObject([{ id: categoryId, pinned: true }]);
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
