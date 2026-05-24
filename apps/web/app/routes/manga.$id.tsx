import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMangaDetail,
  libraryQueryKeys,
  MangaDetailPage,
} from '@app/library';
import { toMangaId } from '@app/shared';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import {
  createAddToLibraryMutationOptions,
  createRemoveFromLibraryMutationOptions,
  createToggleFavoriteMutationOptions,
} from '../queries/library-mutation-options.js';

export const Route = createFileRoute('/manga/$id')({
  component: MangaDetailRoute,
});

function MangaDetailRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = Route.useParams();
  const mangaId = toMangaId(id);
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  const { data, isLoading, isError } = useQuery({
    queryKey: libraryQueryKeys.detail(mangaId),
    queryFn: () => fetchMangaDetail(db!, mangaId),
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
      data={data}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      onBack={() => void navigate({ to: '/library' })}
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
