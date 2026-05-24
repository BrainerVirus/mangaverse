import type { AppDrizzleDb } from '@app/db';
import {
  addMangaToLibrary,
  libraryQueryKeys,
  optimisticallyAddMangaToLibrary,
  optimisticallyRemoveMangaFromLibrary,
  optimisticallySetMangaFavorite,
  removeMangaFromLibrary,
  restoreLibraryCache,
  setMangaFavorite,
  snapshotLibraryCache,
  type MangaDetailData,
} from '@app/library';
import type { MangaId } from '@app/shared';
import type { QueryClient } from '@tanstack/react-query';

interface LibraryMutationContext {
  snapshot: ReturnType<typeof snapshotLibraryCache>;
}

function assertDb(db: AppDrizzleDb | null): asserts db is AppDrizzleDb {
  if (db === null) {
    throw new Error('Local database is not ready.');
  }
}

function invalidateLibraryQueries(queryClient: QueryClient, mangaId: MangaId): void {
  void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.detail(mangaId) });
}

export function createAddToLibraryMutationOptions(
  db: AppDrizzleDb | null,
  queryClient: QueryClient,
  mangaId: MangaId,
) {
  return {
    mutationFn: async () => {
      assertDb(db);
      const result = await addMangaToLibrary(db, mangaId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.all });
      await queryClient.cancelQueries({ queryKey: libraryQueryKeys.detail(mangaId) });

      const snapshot = snapshotLibraryCache(queryClient, mangaId);
      const detail = queryClient.getQueryData<MangaDetailData>(libraryQueryKeys.detail(mangaId));
      if (detail !== undefined) {
        optimisticallyAddMangaToLibrary(queryClient, mangaId, detail.manga);
      }

      return { snapshot } satisfies LibraryMutationContext;
    },
    onError: (_error: Error, _variables: void, context: LibraryMutationContext | undefined) => {
      if (context?.snapshot !== undefined) {
        restoreLibraryCache(queryClient, context.snapshot);
      }
    },
    onSettled: () => {
      if (db !== null) {
        invalidateLibraryQueries(queryClient, mangaId);
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

      const snapshot = snapshotLibraryCache(queryClient, mangaId);
      optimisticallyRemoveMangaFromLibrary(queryClient, mangaId);

      return { snapshot } satisfies LibraryMutationContext;
    },
    onError: (_error: Error, _variables: void, context: LibraryMutationContext | undefined) => {
      if (context?.snapshot !== undefined) {
        restoreLibraryCache(queryClient, context.snapshot);
      }
    },
    onSettled: () => {
      if (db !== null) {
        invalidateLibraryQueries(queryClient, mangaId);
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

      const snapshot = snapshotLibraryCache(queryClient, mangaId);
      optimisticallySetMangaFavorite(queryClient, mangaId, favorite);

      return { snapshot } satisfies LibraryMutationContext;
    },
    onError: (
      _error: Error,
      _favorite: boolean,
      context: LibraryMutationContext | undefined,
    ) => {
      if (context?.snapshot !== undefined) {
        restoreLibraryCache(queryClient, context.snapshot);
      }
    },
    onSettled: () => {
      if (db !== null) {
        invalidateLibraryQueries(queryClient, mangaId);
      }
    },
  };
}
