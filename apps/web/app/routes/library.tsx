import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { AppDrizzleDb } from '@app/db';
import {
  clearLibraryUpdateReport,
  DEFAULT_LIBRARY_VIEW_STATE,
  LibraryPage,
  libraryQueryKeys,
  runLibraryUpdateQueue,
  type LibraryMigrationSelection,
  type LibraryUpdateReport,
} from '@app/library';
import type { ChapterId, LibraryEntryId, LibraryViewState, MangaId } from '@app/shared';
import {
  libraryOverviewQueryOptions,
  libraryPageQueryOptions,
  libraryUpdateReportQueryOptions,
} from '../queries/library-query-options.js';
import { createLibraryOrganizationMutationOptions } from '../queries/library-mutation-options.js';
import { createLibraryUpdateProviderResolver } from '../lib/library-update-provider.js';
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
      void navigate({ to: '/reader/$chapterId', params: { chapterId } });
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

  const { data, isLoading, isError } = useQuery({
    ...libraryPageQueryOptions(db!, viewState),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const overview = useQuery({
    ...libraryOverviewQueryOptions(db!, viewState.filter),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const savedReport = useQuery({
    ...libraryUpdateReportQueryOptions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

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
      updates={{
        status: isChecking ? 'running' : 'idle',
        report: progress ?? savedReport.data,
        onCheck: () => void runCheck(),
        onCancel: () => abortRef.current?.abort(),
        onRetry: (entryIds) => void runCheck(entryIds),
        onClearReport: () => void clearReport(),
      }}
      onOrganize={(action) => organizeMutation.mutateAsync(action)}
      onMigrate={migrateSelection}
      onBrowse={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
