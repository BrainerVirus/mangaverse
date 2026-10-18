import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { saveReaderSettings, settingsQueryKeys } from '@app/settings';
import type { ReaderSettings } from '@app/shared';
import {
  fetchReaderPage,
  persistReaderProgress,
  ReaderScreen,
  readerQueryKeys,
  toReaderEngineSettings,
  type ReaderPageData,
} from '@app/reader';
import { toChapterId } from '@app/shared';
import {
  useLocalDb,
  useLocalDbRetry,
  useLocalDbStatus,
  useReportPersistenceError,
} from '../providers/local-db-provider.js';
import { useOnlineStatus } from '../lib/use-online-status.js';
import { useLayoutStore } from '../stores/useLayoutStore.js';
import { PersistenceErrorBanner } from '../components/PersistenceErrorBanner.js';
import { ensureProviderChapterPages } from '../queries/provider-query-options.js';

export const Route = createFileRoute('/reader/$chapterId')({
  component: ReaderRoute,
});

function formatWriteError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ReaderRoute() {
  const { chapterId: chapterIdParam } = Route.useParams();
  const chapterId = toChapterId(chapterIdParam);
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const reportPersistenceError = useReportPersistenceError();
  const { readerChromeVisible, toggleReaderChrome } = useLayoutStore();

  const isOnline = useOnlineStatus();
  const { data, isLoading, isError } = useQuery({
    queryKey: readerQueryKeys.chapter(chapterId),
    queryFn: async ({ signal }) => {
      await ensureProviderChapterPages(db!, chapterId, signal);
      return fetchReaderPage(db!, chapterId);
    },
    enabled: dbStatus === 'ready' && db !== null,
    // Progress and chapter data change behind the reader's back (checkpoint on
    // leave, another tab); a cached mount must never show a stale page.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const { mutate: saveSettings } = useMutation({
    mutationFn: async (next: ReaderSettings) => {
      const result = await saveReaderSettings(db!, next);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      const previous = queryClient.getQueryData<ReaderPageData>(readerQueryKeys.chapter(chapterId));
      queryClient.setQueryData<ReaderPageData>(readerQueryKeys.chapter(chapterId), (current) =>
        current === undefined
          ? current
          : { ...current, settings: next, engineSettings: toReaderEngineSettings(next) },
      );
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(readerQueryKeys.chapter(chapterId), context.previous);
      }
      // The reader has no shell banner above it; report through the same sink.
      reportPersistenceError(formatWriteError(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  const handleChangeSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      if (db === null || data?.settings === undefined) return;
      saveSettings({ ...data.settings, ...patch });
    },
    [data, db, saveSettings],
  );

  const handlePersistProgress = useCallback(
    (event: Parameters<typeof persistReaderProgress>[1]) => {
      if (db === null) return;
      // A rejected write must not be swallowed: it lands in the shell's
      // persistence-error sink, which the reader overlays with the banner.
      void persistReaderProgress(db, event).catch((error: unknown) => {
        reportPersistenceError(formatWriteError(error));
      });
    },
    [db, reportPersistenceError],
  );

  return (
    <>
      {/*
        Reader mode replaces the shell layout, so the shell's persistence
        banner is not mounted here; the same alert overlays the reader.
      */}
      <div className="fixed inset-x-0 top-0 z-60">
        <PersistenceErrorBanner />
      </div>
      <ReaderScreen
        data={data}
        isLoading={dbStatus === 'loading' || isLoading}
        isError={dbStatus === 'error' || isError}
        chromeVisible={readerChromeVisible}
        onToggleChrome={toggleReaderChrome}
        onPersistProgress={handlePersistProgress}
        onChangeSettings={handleChangeSettings}
        isOffline={!isOnline}
        onRetry={() => {
          // While the DB is in error the reader query is disabled, so
          // invalidating it does nothing; rebuild the handle first.
          if (dbStatus === 'error') {
            retryDb();
            return;
          }
          void queryClient.invalidateQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
        }}
      />
    </>
  );
}
