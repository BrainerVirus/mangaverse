import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMangaDetail,
  libraryQueryKeys,
  MangaDetailPage,
} from '@app/library';
import type { AppDrizzleDb } from '@app/db/browser';
import { toMangaId, type MangaId } from '@app/shared';
import {
  createAddToLibraryMutationOptions,
  createRemoveFromLibraryMutationOptions,
  createToggleFavoriteMutationOptions,
} from '../queries/library-mutation-options.js';
import {
  fetchDevMangaDetail,
  isDevMangaDexId,
  isMangaDexInstalled,
} from '../lib/dev-mangadex-search.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/manga/$id')({
  component: MangaDetailRoute,
});

async function resolveMangaDetail(db: AppDrizzleDb, mangaId: MangaId) {
  const local = await fetchMangaDetail(db, mangaId);
  if (local !== null) {
    return local;
  }

  if (!import.meta.env.DEV || !isDevMangaDexId(mangaId)) {
    return null;
  }

  const mangadexInstalled = await isMangaDexInstalled(db);
  if (!mangadexInstalled) {
    return null;
  }

  return fetchDevMangaDetail(mangaId);
}

function MangaDetailRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = Route.useParams();
  const mangaId = toMangaId(id);
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  const { data, isLoading, isError } = useQuery({
    queryKey: libraryQueryKeys.detail(mangaId),
    queryFn: () => resolveMangaDetail(db!, mangaId),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const addMutation = useMutation(createAddToLibraryMutationOptions(db, queryClient, mangaId));
  const removeMutation = useMutation(createRemoveFromLibraryMutationOptions(db, queryClient, mangaId));
  const favoriteMutation = useMutation(createToggleFavoriteMutationOptions(db, queryClient, mangaId));
  const isLibraryActionPending =
    addMutation.isPending || removeMutation.isPending || favoriteMutation.isPending;

  return (
    <MangaDetailPage
      mangaId={mangaId}
      data={data ?? null}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      onBack={() => void navigate({ to: '/search' })}
      onOpenChapter={(chapterId) =>
        void navigate({ to: '/reader/$chapterId', params: { chapterId } })
      }
      onAddToLibrary={() => addMutation.mutate()}
      onRemoveFromLibrary={() => removeMutation.mutate()}
      onToggleFavorite={() =>
        favoriteMutation.mutate(!(data?.libraryEntry?.favorite ?? false))
      }
      isLibraryActionPending={isLibraryActionPending}
    />
  );
}
