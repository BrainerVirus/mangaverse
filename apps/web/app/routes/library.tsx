import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useStateReducer } from '@app/design-system';
import type { AppDrizzleDb } from '@app/db';
import { extensionsQueryKeys, fetchProviderUiInfo } from '@app/extensions';
import {
  clearLibraryUpdateReport,
  DEFAULT_LIBRARY_VIEW_STATE,
  editEntriesOptimistically,
  LibraryPage,
  libraryQueryKeys,
  runLibraryUpdateQueue,
  useLibraryList,
  type LibraryMigrationSelection,
  type LibraryOrganizationAction,
  type LibraryUpdateReport,
} from '@/features/library';
import { MIGRATION_BATCH_LIMIT } from '@/features/migration/index.js';
import type { ChapterId, LibraryEntryId, LibraryViewState, MangaId } from '@app/shared';
import {
  libraryOverviewQueryOptions,
  libraryUpdateReportQueryOptions,
} from '../queries/library-query-options.js';
import { createLibraryOrganizationMutationOptions } from '../queries/library-mutation-options.js';
import { feedback } from '../lib/app-feedback.js';
import { saveFeedback } from '../lib/feedback.js';
import { createLibraryUpdateProviderResolver } from '../lib/library-update-provider.js';
import { subscribeToLocalChanges } from '../lib/local-db.js';
import { readerSessionState } from '../lib/navigation-history.js';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/library')({
  component: LibraryRoute,
});

async function runLibraryUpdates(
  db: AppDrizzleDb,
  queryClient: QueryClient,
  controller: AbortController,
  entryIds: readonly LibraryEntryId[] | undefined,
  onProgress: (report: LibraryUpdateReport) => void,
): Promise<void> {
  try {
    await runLibraryUpdateQueue(db, {
      resolveProvider: createLibraryUpdateProviderResolver(db),
      signal: controller.signal,
      onProgress,
      ...(entryIds === undefined ? {} : { entryIds }),
    });
  } catch {
    // A storage failure also fails the library query; keep the last report.
  } finally {
    void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
  }
}

/**
 * True only while the shelves' first load runs. A later filter change refetches them without
 * swapping the rows for placeholders, so the flag latches off once they have settled.
 */
function useOverviewFirstLoad(isPending: boolean): boolean {
  const [settled, settle] = useStateReducer((_settled: boolean, next: true) => next, false);
  if (!settled && !isPending) settle(true);
  return !settled && isPending;
}

function LibraryRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const [viewState, setViewState] = useState<LibraryViewState>(DEFAULT_LIBRARY_VIEW_STATE);
  const [progress, setProgress] = useState<LibraryUpdateReport | undefined>(undefined);
  const [isChecking, setIsChecking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const organizeMutation = useMutation(createLibraryOrganizationMutationOptions(db, queryClient));

  const openManga = useCallback(
    (mangaId: MangaId) => {
      void navigate({ to: '/manga/$id', params: { id: mangaId } });
    },
    [navigate],
  );
  const openChapter = useCallback(
    (chapterId: ChapterId) => {
      void navigate({
        to: '/reader/$chapterId',
        params: { chapterId },
        state: (previous) => ({ ...previous, ...readerSessionState }),
      });
    },
    [navigate],
  );
  const migrateSelection = useCallback(
    (selection: LibraryMigrationSelection) => {
      void navigate({
        to: '/migration',
        search: {
          ids: [...selection.mangaIds],
          ...(selection.sourceProviderIds.length === 0
            ? {}
            : { sources: [...selection.sourceProviderIds] }),
        },
      });
    },
    [navigate],
  );

  const { data, isLoading, isError, items, hasMore, loadMore } = useLibraryList(
    dbStatus === 'ready' ? db : null,
    viewState,
    subscribeToLocalChanges,
  );
  const overview = useQuery({
    ...libraryOverviewQueryOptions(db!, viewState.filter),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const isOverviewLoading = useOverviewFirstLoad(overview.isPending);
  const savedReport = useQuery({
    ...libraryUpdateReportQueryOptions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const providerInfo = useQuery({
    queryKey: extensionsQueryKeys.ui(),
    queryFn: () => fetchProviderUiInfo(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const sourceLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const provider of providerInfo.data ?? []) labels[provider.id] = provider.name;
    return labels;
  }, [providerInfo.data]);

  const runCheck = useCallback(
    async (entryIds?: readonly LibraryEntryId[]) => {
      if (db === null || abortRef.current !== null) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsChecking(true);
      await runLibraryUpdates(db, queryClient, controller, entryIds, setProgress);
      abortRef.current = null;
      setIsChecking(false);
    },
    [db, queryClient],
  );

  /**
   * Status and favorite edits apply to the list at once and roll back if the host refuses them;
   * every other action still runs through its Query mutation.
   */
  const organize = (action: LibraryOrganizationAction): Promise<void> => {
    if (
      items === null ||
      (action.type !== 'set_entries_status' && action.type !== 'set_entries_favorite')
    ) {
      return organizeMutation.mutateAsync(action);
    }
    const edit =
      action.type === 'set_entries_status'
        ? ({ field: 'status', value: action.status } as const)
        : ({ field: 'favorite', value: action.favorite } as const);
    return editEntriesOptimistically(items, action.entryIds, edit).then(
      () => void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all }),
      (error: unknown) => {
        feedback.onFailure(error, {
          source: 'library.organize',
          feedback: saveFeedback('Could not update your library.').feedback,
        });
        throw error;
      },
    );
  };

  const clearReport = useCallback(async () => {
    if (db === null) return;
    setProgress(undefined);
    await clearLibraryUpdateReport(db);
    queryClient.removeQueries({ queryKey: libraryQueryKeys.updateReport() });
  }, [db, queryClient]);

  return (
    <LibraryPage
      data={data}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      viewState={viewState}
      onViewStateChange={setViewState}
      onOpenManga={openManga}
      onOpenChapter={openChapter}
      {...(overview.data === undefined ? {} : { overview: overview.data })}
      isOverviewLoading={isOverviewLoading}
      updates={{
        status: isChecking ? 'running' : 'idle',
        report: progress ?? savedReport.data ?? undefined,
        onCheck: () => void runCheck(),
        onCancel: () => abortRef.current?.abort(),
        onRetry: (entryIds) => void runCheck(entryIds),
        onClearReport: () => void clearReport(),
      }}
      {...(hasMore ? { onLoadMore: loadMore } : {})}
      onOrganize={(action) => organize(action)}
      onMigrate={migrateSelection}
      migrationBatchLimit={MIGRATION_BATCH_LIMIT}
      sourceLabels={sourceLabels}
      onBrowse={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
