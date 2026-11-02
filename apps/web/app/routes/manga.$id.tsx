import { useMemo } from 'react';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  findDuplicateCandidates,
  libraryQueryKeys,
  MangaDetailPage,
  type DuplicateCandidatesState,
  type MangaDetailData,
  type MergeDuplicateInput,
} from '@/features/library';
import {
  fetchMangaDownloads,
  downloadsQueryKeys,
  useDownloadEngine,
  useDownloadProgress,
  type DownloadCommand,
} from '@/features/downloads';
import { extensionsQueryKeys, fetchProviderUiInfo } from '@app/extensions';
import {
  mergeMangaIdentities,
  previewMergeMangaIdentities,
  previewUnmergeProviderMapping,
  unmergeProviderMapping,
} from '@app/db';
import {
  toLibraryEntryId,
  toMangaId,
  type ChapterId,
  type MangaProviderMapping,
  type ProviderMappingId,
} from '@app/shared';
import { notify } from '@app/design-system';
import {
  createAddToLibraryMutationOptions,
  createLibraryOrganizationMutationOptions,
  createRemoveFromLibraryMutationOptions,
  createToggleFavoriteMutationOptions,
} from '../queries/library-mutation-options.js';
import {
  fetchProviderRelatedTitles,
  hydrateProviderChaptersForMapping,
} from '../queries/provider-query-options.js';
import {
  canRefreshMangaDetail,
  localMangaDetailQueryOptions,
  mangaDetailRefreshQueryOptions,
} from '../queries/manga-detail-refresh.js';
import {
  anyActionPending,
  canHydrateChapters,
  canLoadRelated,
  categoriesChangeHandler,
  chapterHydrationQueryKey,
  countChaptersForMapping,
  detailOrNull,
  goBackOrLibrary,
  invalidateIdentityMergeCaches,
  invalidateMangaCaches,
  isDbReady,
  isPageError,
  isPageLoading,
  openMigration,
  pickRelatedProps,
  providerCapability,
  queryErrorMessage,
  relatedQueryKey,
  runChapterAction,
  runCoverAction,
  runProviderAction,
} from '../queries/manga-detail-route-helpers.js';
import { saveFeedback } from '../lib/feedback.js';
import { failureMessage } from '../lib/app-feedback.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/manga/$id')({
  component: MangaDetailRoute,
});

function resolveActiveMapping(
  data: MangaDetailData | null | undefined,
): MangaProviderMapping | undefined {
  if (data === null || data === undefined) return undefined;
  const { manga, libraryEntry } = data;
  const preferredId =
    libraryEntry?.activeProviderMappingId ??
    manga.preferredChapterSourceId ??
    manga.defaultProviderMappingId;
  return (
    manga.providerMappings.find((mapping) => mapping.id === preferredId) ??
    manga.providerMappings.find((mapping) => mapping.id === manga.defaultProviderMappingId) ??
    manga.providerMappings[0]
  );
}

function MangaDetailRoute() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = Route.useParams();
  const mangaId = toMangaId(id);
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const ready = isDbReady(db, dbStatus);

  const localDetailQuery = useQuery({
    ...localMangaDetailQueryOptions(db!, mangaId),
    // Local-first: the surface resolves from SQLite and never waits for a provider.
    enabled: ready,
  });

  const detailRefreshQuery = useQuery({
    ...mangaDetailRefreshQueryOptions(db!, queryClient, mangaId),
    // The provider refresh runs beside the surface, never in front of it.
    enabled: ready && canRefreshMangaDetail(mangaId),
  });

  const data = localDetailQuery.data;
  const hasLocalDetail = data !== undefined && data !== null;
  const awaitingFirstDetail =
    ready && canRefreshMangaDetail(mangaId) && !hasLocalDetail && detailRefreshQuery.isFetching;
  const detailFailed =
    !hasLocalDetail && detailRefreshQuery.isError && !detailRefreshQuery.isFetching;

  const providerInfoQuery = useQuery({
    queryKey: extensionsQueryKeys.ui(),
    queryFn: () => fetchProviderUiInfo(db!),
    enabled: ready,
  });

  const duplicatesQuery = useQuery({
    queryKey: libraryQueryKeys.duplicates(mangaId),
    queryFn: () => findDuplicateCandidates(db!, mangaId),
    enabled: ready,
  });

  const downloadsQuery = useQuery({
    queryKey: downloadsQueryKeys.forManga(mangaId),
    queryFn: () => fetchMangaDownloads(db!, mangaId),
    enabled: ready,
  });
  const downloadEngine = useDownloadEngine();
  const downloadProgress = useDownloadProgress();

  function runDownloadCommand(chapterId: ChapterId, command: DownloadCommand): void {
    if (downloadEngine === null) return;
    const action = (() => {
      switch (command) {
        case 'download':
          return downloadEngine.enqueue(chapterId);
        case 'cancel':
          return downloadEngine.cancel(chapterId);
        case 'retry':
          return downloadEngine.retry(chapterId);
        case 'remove':
          return downloadEngine.remove(chapterId);
      }
    })();
    void action.catch((error: unknown) => {
      notify.failure({
        key: 'download-action',
        message: failureMessage(error, 'Could not update the download.'),
      });
    });
  }

  const providerLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const provider of providerInfoQuery.data ?? []) labels[provider.id] = provider.name;
    return labels;
  }, [providerInfoQuery.data]);

  const activeMapping = resolveActiveMapping(data);
  const activeProvider = providerInfoQuery.data?.find(
    (provider) => provider.id === activeMapping?.providerId,
  );

  const recommendationsQuery = useQuery({
    queryKey: relatedQueryKey(mangaId, 'recommendations', activeMapping),
    queryFn: ({ signal }) =>
      fetchProviderRelatedTitles(db!, activeMapping!, 'recommendations', signal),
    enabled: canLoadRelated(activeProvider, activeMapping, 'recommendations', ready),
    retry: false,
  });

  const relatedTitlesQuery = useQuery({
    queryKey: relatedQueryKey(mangaId, 'related', activeMapping),
    queryFn: ({ signal }) =>
      fetchProviderRelatedTitles(db!, activeMapping!, 'relatedTitles', signal),
    enabled: canLoadRelated(activeProvider, activeMapping, 'relatedTitles', ready),
    retry: false,
  });

  const chapterHydrationQuery = useQuery({
    queryKey: chapterHydrationQueryKey(mangaId, activeMapping),
    queryFn: async ({ signal }) => {
      const written = await hydrateProviderChaptersForMapping(db!, mangaId, activeMapping!, signal);
      // The badge, not only the detail list, changed with the hydrated rows.
      await queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
      return written;
    },
    meta: { feedback: { surface: 'inline' } },
    enabled:
      canHydrateChapters(
        activeProvider,
        activeMapping,
        ready,
        countChaptersForMapping(data, activeMapping) > 0,
      ) && !detailRefreshQuery.isFetching,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  const addMutation = useMutation(createAddToLibraryMutationOptions(db, queryClient, mangaId));
  const removeMutation = useMutation(
    createRemoveFromLibraryMutationOptions(db, queryClient, mangaId),
  );
  const favoriteMutation = useMutation(
    createToggleFavoriteMutationOptions(db, queryClient, mangaId),
  );
  const organizeMutation = useMutation(createLibraryOrganizationMutationOptions(db, queryClient));

  const providerMutation = useMutation({
    meta: saveFeedback('Could not update the source.'),
    mutationFn: (action: Parameters<typeof runProviderAction>[3]) =>
      runProviderAction(db, mangaId, data, action),
    // A detail/card refetch started before the write would otherwise land after
    // it and repaint the previous mapping.
    onMutate: () => queryClient.cancelQueries({ queryKey: libraryQueryKeys.all }),
    onSettled: () => invalidateMangaCaches(queryClient),
  });

  const coverMutation = useMutation({
    meta: saveFeedback('Could not update the cover.'),
    mutationFn: (coverImageUrl: string | undefined) => runCoverAction(db, mangaId, coverImageUrl),
    onSettled: () => invalidateMangaCaches(queryClient),
  });

  const chapterMutation = useMutation({
    meta: saveFeedback('Could not update read progress.'),
    mutationFn: (action: Parameters<typeof runChapterAction>[2]) =>
      runChapterAction(db, mangaId, action),
    onSettled: () => invalidateMangaCaches(queryClient),
  });

  const mergeMutation = useMutation({
    mutationFn: async (input: MergeDuplicateInput) => {
      if (db === null) throw new Error('Local database is not ready.');
      const result = await mergeMangaIdentities(db, input);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    onMutate: () => queryClient.cancelQueries({ queryKey: libraryQueryKeys.all }),
    onSettled: () => {
      invalidateIdentityMergeCaches(queryClient);
    },
  });

  const unmergeMutation = useMutation({
    mutationFn: async (mappingId: ProviderMappingId) => {
      if (db === null) throw new Error('Local database is not ready.');
      const result = await unmergeProviderMapping(db, { mangaId, mappingId });
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    onMutate: () => queryClient.cancelQueries({ queryKey: libraryQueryKeys.all }),
    onSettled: () => {
      invalidateIdentityMergeCaches(queryClient);
    },
  });

  const duplicatesError = queryErrorMessage(duplicatesQuery.error);
  const duplicatesState: DuplicateCandidatesState = {
    ...(duplicatesQuery.data === undefined ? {} : { items: duplicatesQuery.data }),
    isLoading: duplicatesQuery.isLoading,
    ...(duplicatesError === undefined ? {} : { error: duplicatesError }),
    onRetry: () => void duplicatesQuery.refetch(),
  };

  const chaptersError = queryErrorMessage(chapterHydrationQuery.error);
  const isLibraryActionPending = anyActionPending([
    addMutation.isPending,
    removeMutation.isPending,
    favoriteMutation.isPending,
    organizeMutation.isPending,
  ]);

  return (
    <MangaDetailPage
      mangaId={mangaId}
      data={detailOrNull(data)}
      isLoading={isPageLoading(dbStatus, localDetailQuery.isLoading) || awaitingFirstDetail}
      isError={isPageError(dbStatus, localDetailQuery.isError) || detailFailed}
      onBack={() =>
        goBackOrLibrary({
          canGoBack: () => router.history.canGoBack(),
          back: () => router.history.back(),
          openLibrary: () => void navigate({ to: '/library' }),
        })
      }
      onOpenChapter={(chapterId) =>
        void navigate({ to: '/reader/$chapterId', params: { chapterId } })
      }
      onAddToLibrary={() => addMutation.mutate(toLibraryEntryId(globalThis.crypto.randomUUID()))}
      onRemoveFromLibrary={() => removeMutation.mutate()}
      onToggleFavorite={() => favoriteMutation.mutate(!(data?.libraryEntry?.favorite ?? false))}
      onCategoriesChange={categoriesChangeHandler(data, organizeMutation.mutateAsync)}
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
      providerLabels={providerLabels}
      isProviderActionPending={providerMutation.isPending}
      onSelectProvider={(mappingId) => providerMutation.mutateAsync({ type: 'select', mappingId })}
      onSetDefaultProvider={(mappingId) =>
        providerMutation.mutateAsync({ type: 'default', mappingId })
      }
      onSetPreferredChapterSource={(mappingId) =>
        providerMutation.mutateAsync({ type: 'preferred', mappingId })
      }
      isChapterActionPending={chapterMutation.isPending}
      isChaptersLoading={chapterHydrationQuery.isFetching}
      {...(chaptersError === undefined ? {} : { chaptersError })}
      onRetryChapters={() => void chapterHydrationQuery.refetch()}
      onSetChapterRead={(chapterId, read) =>
        chapterMutation.mutateAsync({ type: 'set', chapterId, read })
      }
      onMarkPreviousChaptersRead={(chapterId) =>
        chapterMutation.mutateAsync({ type: 'previous', chapterId })
      }
      {...(downloadsQuery.data === undefined ? {} : { downloads: downloadsQuery.data })}
      downloadProgress={downloadProgress}
      isDownloadPending={downloadEngine === null}
      onDownloadCommand={runDownloadCommand}
      isCoverActionPending={coverMutation.isPending}
      onSetCoverImageUrl={(url) => coverMutation.mutateAsync(url)}
      onOpenMigration={() => openMigration((href) => void navigate({ href }), activeMapping)}
      onOpenProviderSettings={(providerId) =>
        void navigate({ to: '/extensions/$providerId', params: { providerId } })
      }
      onOpenReaderSettings={() =>
        void navigate({ to: '/settings/reader', search: { title: String(mangaId) } } as never)
      }
      {...pickRelatedProps({
        canRecommend: providerCapability(activeProvider, 'metadata.recommendations'),
        canRelate: providerCapability(activeProvider, 'metadata.relatedTitles'),
        recommendations: recommendationsQuery,
        relatedTitles: relatedTitlesQuery,
      })}
      onOpenRelatedManga={(relatedMangaId) =>
        void navigate({ to: '/manga/$id', params: { id: relatedMangaId } })
      }
      duplicates={duplicatesState}
      isMergePending={mergeMutation.isPending}
      loadMergePreview={(targetId, sourceId) => {
        if (db === null) throw new Error('Local database is not ready.');
        return previewMergeMangaIdentities(db, targetId, sourceId);
      }}
      onMerge={(input) => mergeMutation.mutateAsync(input).then(() => undefined)}
      onMerged={(targetId) => {
        if (targetId !== mangaId) {
          void navigate({ to: '/manga/$id', params: { id: targetId } });
        }
      }}
      isUnmergePending={unmergeMutation.isPending}
      loadUnmergePreview={(mappingId) => {
        if (db === null) throw new Error('Local database is not ready.');
        return previewUnmergeProviderMapping(db, mangaId, mappingId);
      }}
      onUnmerge={(mappingId) => unmergeMutation.mutateAsync(mappingId).then(() => undefined)}
    />
  );
}
