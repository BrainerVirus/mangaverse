import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMangaDetail, libraryQueryKeys, MangaDetailPage } from '@app/library';
import type { AppDrizzleDb } from '@app/db/browser';
import { toMangaId, type MangaId } from '@app/shared';
import {
  createAddToLibraryMutationOptions,
  createRemoveFromLibraryMutationOptions,
  createToggleFavoriteMutationOptions,
} from '../queries/library-mutation-options.js';
import { fetchProviderMangaDetail } from '../queries/provider-query-options.js';
import { getBindingForMangaId } from '../lib/provider-registry.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/manga/$id')({
  component: MangaDetailRoute,
});

async function resolveMangaDetail(db: AppDrizzleDb, mangaId: MangaId, signal?: AbortSignal) {
  const local = await fetchMangaDetail(db, mangaId);

  const binding = getBindingForMangaId(mangaId);
  if (binding === null) {
    return local;
  }

  try {
    const refreshed = await fetchProviderMangaDetail(db, binding, mangaId, local, signal);
    return refreshed ?? local;
  } catch {
    // Provider failure must not blank a locally available detail page.
    return local;
  }
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
    queryFn: ({ signal }) => resolveMangaDetail(db!, mangaId, signal),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const addMutation = useMutation(createAddToLibraryMutationOptions(db, queryClient, mangaId));
  const removeMutation = useMutation(
    createRemoveFromLibraryMutationOptions(db, queryClient, mangaId),
  );
  const favoriteMutation = useMutation(
    createToggleFavoriteMutationOptions(db, queryClient, mangaId),
  );
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
      onToggleFavorite={() => favoriteMutation.mutate(!(data?.libraryEntry?.favorite ?? false))}
      isLibraryActionPending={isLibraryActionPending}
    />
  );
}
