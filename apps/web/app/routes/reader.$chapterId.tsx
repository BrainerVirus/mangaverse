import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { saveReaderSettings, settingsQueryKeys } from '@app/settings';
import { libraryQueryKeys } from '@app/library';
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
import { getBindingForChapterId } from '../lib/provider-registry.js';
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
    // Local-first: the reader renders SQLite only. Provider pages arrive through
    // the hydration command below, never from the read that gates the surface.
    queryFn: () => fetchReaderPage(db!, chapterId),
    enabled: dbStatus === 'ready' && db !== null,
    // Progress and chapter data change behind the reader's back (checkpoint on
    // leave, another tab); a cached mount must never show a stale page.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const binding = getBindingForChapterId(chapterId);
  const hasLocalPages = (data?.chapter.pageCount ?? 0) > 0;
  // Hydrate only a locally empty chapter that a provider binding owns; the
  // command re-checks the same contracts before it reaches the network.
  const shouldHydrate =
    dbStatus === 'ready' && db !== null && data !== undefined && !hasLocalPages && binding !== null;

  const hydration = useQuery({
    queryKey: readerQueryKeys.chapterHydration(chapterId),
    queryFn: async ({ signal }) => {
      await ensureProviderChapterPages(db!, chapterId, signal);
      // Pages are now in SQLite: refresh only the local chapter read. gcTime is
      // zero, so a remount never replays a stale hydration result.
      await queryClient.invalidateQueries({
        queryKey: readerQueryKeys.chapter(chapterId),
        exact: true,
      });
    },
    enabled: shouldHydrate,
    // A provider page fetch is visible work with its own Retry, not a cache
    // warm: no global retry policy and no refetch-on-reconnect duplicate.
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const isHydrating = shouldHydrate && (hydration.isPending || hydration.isFetching);
  const isHydrationError = shouldHydrate && hydration.isError && !hydration.isFetching;
  const hydrationFailed = hydration.isError;
  const retryHydration = hydration.refetch;

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

  // The library keeps a five-minute staleTime, so reading must mark it stale or
  // the user returns to old progress. One mark per mount is enough: a stale
  // query stays stale, and page turns would otherwise re-walk the cache.
  const markedLibraryStale = useRef(false);
  const handlePersistProgress = useCallback(
    (event: Parameters<typeof persistReaderProgress>[1]) => {
      if (db === null) return;
      void persistReaderProgress(db, event).then(
        () => {
          // `refetchType: 'none'` marks stale without pulling the library back
          // into the reader; the library route refetches when it mounts again.
          if (markedLibraryStale.current) return;
          markedLibraryStale.current = true;
          void queryClient.invalidateQueries({
            queryKey: libraryQueryKeys.all,
            refetchType: 'none',
          });
        },
        // A rejected write must not be swallowed: it lands in the shell's
        // persistence-error sink, which the reader overlays with the banner.
        (error: unknown) => {
          reportPersistenceError(formatWriteError(error));
        },
      );
    },
    [db, queryClient, reportPersistenceError],
  );

  const handleRetry = useCallback(() => {
    // While the DB is in error the reader query is disabled, so invalidating it
    // does nothing; rebuild the handle first.
    if (dbStatus === 'error') {
      retryDb();
      return;
    }
    // A provider failure is retried through the hydration command, not by
    // re-reading the unchanged local chapter.
    if (shouldHydrate && hydrationFailed) {
      void retryHydration();
      return;
    }
    void queryClient.invalidateQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
  }, [chapterId, dbStatus, hydrationFailed, queryClient, retryDb, retryHydration, shouldHydrate]);

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
        isHydrating={isHydrating}
        isHydrationError={isHydrationError}
        chromeVisible={readerChromeVisible}
        onToggleChrome={toggleReaderChrome}
        onPersistProgress={handlePersistProgress}
        onChangeSettings={handleChangeSettings}
        isOffline={!isOnline}
        onRetry={handleRetry}
      />
    </>
  );
}
