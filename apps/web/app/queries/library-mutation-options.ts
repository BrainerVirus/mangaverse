import type { AppDrizzleDb } from '@app/db';
import {
  addMangaToLibrary,
  libraryQueryKeys,
  optimisticallyAddMangaToLibrary,
  optimisticallyRemoveMangaFromLibrary,
  optimisticallySetMangaFavorite,
  removeMangaFromLibrary,
  setMangaFavorite,
  type MangaDetailData,
} from '@app/library';
import type { LibraryEntryId, MangaId } from '@app/shared';
import type { QueryClient } from '@tanstack/react-query';

function assertDb(db: AppDrizzleDb | null): asserts db is AppDrizzleDb {
  if (db === null) {
    throw new Error('Local database is not ready.');
  }
}

function invalidateLibraryQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
}

export function createAddToLibraryMutationOptions(
  db: AppDrizzleDb | null,
  queryClient: QueryClient,
  mangaId: MangaId,
) {
  return {
    mutationFn: async (entryId: LibraryEntryId) => {
      assertDb(db);
      const result = await addMangaToLibrary(db, mangaId, 'planned', entryId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    onMutate: async (entryId: LibraryEntryId) => {
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.all });
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.detail(mangaId) });

      const detail = queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId));
      if (detail !== undefined) {
        optimisticallyAddMangaToLibrary(queryClient, mangaId, detail.manga, entryId);
      }
    },
    onError: () => {
      // The write failed, so the optimistic row is the only trace: remove it
      // instead of restoring a whole-page snapshot that could clobber a
      // concurrent optimistic mutation.
      optimisticallyRemoveMangaFromLibrary(queryClient, mangaId);
      invalidateLibraryQueries(queryClient);
    },
    onSettled: () => {
      if (db !== null) {
        invalidateLibraryQueries(queryClient);
      }
    },
  };
}

export function createRemoveFromLibraryMutationOptions(
  db: AppDrizzleDb | null,
  queryClient: QueryClient,
  mangaId: MangaId,
) {
  return {
    mutationFn: async () => {
      assertDb(db);
      const result = await removeMangaFromLibrary(db, mangaId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.all });
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.detail(mangaId) });

      optimisticallyRemoveMangaFromLibrary(queryClient, mangaId);
    },
    onError: () => {
      // The local row still exists; let the targeted refetch put it back
      // without rewriting unrelated optimistic patches.
      invalidateLibraryQueries(queryClient);
    },
    onSettled: () => {
      if (db !== null) {
        invalidateLibraryQueries(queryClient);
      }
    },
  };
}

export function createToggleFavoriteMutationOptions(
  db: AppDrizzleDb | null,
  queryClient: QueryClient,
  mangaId: MangaId,
) {
  return {
    mutationFn: async (favorite: boolean) => {
      assertDb(db);
      const result = await setMangaFavorite(db, mangaId, favorite);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onMutate: async (favorite: boolean) => {
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.all });
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.detail(mangaId) });

      optimisticallySetMangaFavorite(queryClient, mangaId, favorite);
    },
    onError: () => {
      invalidateLibraryQueries(queryClient);
    },
    onSettled: () => {
      if (db !== null) {
        invalidateLibraryQueries(queryClient);
      }
    },
  };
}
