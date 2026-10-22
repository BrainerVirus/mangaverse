import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMangaDetail, libraryQueryKeys, MangaDetailPage } from '@app/library';
import type { AppDrizzleDb } from '@app/db/browser';
import { toLibraryEntryId, toMangaId, type MangaId } from '@app/shared';
import {
  createAddToLibraryMutationOptions,
  createLibraryOrganizationMutationOptions,
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
  const router = useRouter();
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
  const organizeMutation = useMutation(createLibraryOrganizationMutationOptions(db, queryClient));
  const isLibraryActionPending =
    addMutation.isPending ||
    removeMutation.isPending ||
    favoriteMutation.isPending ||
    organizeMutation.isPending;

  return (
    <MangaDetailPage
      mangaId={mangaId}
      data={data ?? null}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      onBack={() => {
        // Return to the real origin (library, search, discover). A direct link has no in-app
        // history, so it falls back to the library instead of leaving the app.
        if (router.history.canGoBack()) {
          router.history.back();
          return;
        }
        void navigate({ to: '/library' });
      }}
      onOpenChapter={(chapterId) =>
        void navigate({ to: '/reader/$chapterId', params: { chapterId } })
      }
      onAddToLibrary={() => addMutation.mutate(toLibraryEntryId(globalThis.crypto.randomUUID()))}
      onRemoveFromLibrary={() => removeMutation.mutate()}
      onToggleFavorite={() => favoriteMutation.mutate(!(data?.libraryEntry?.favorite ?? false))}
      onCategoriesChange={(categoryIds) => {
        const entryId = data?.libraryEntry?.id;
        if (entryId === undefined) return;
        return organizeMutation.mutateAsync({
          type: 'set_entry_categories',
          entryIds: [entryId],
          categoryIds,
        });
      }}
      onStatusChange={(status) => {
        const entryId = data?.libraryEntry?.id;
        if (entryId === undefined) return;
        organizeMutation.mutate({
          type: 'set_entries_status',
          entryIds: [entryId],
          status,
        });
      }}
      isLibraryActionPending={isLibraryActionPending}
    />
  );
}
