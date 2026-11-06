import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { saveReaderSettingsLayers, settingsQueryKeys } from '@/features/settings';
import {
  markPreviousChaptersCompleted,
  setChapterCompleted,
  resetTitleReaderSettings,
} from '@app/db';
import type { AppDrizzleDb } from '@app/db';
import { libraryQueryKeys } from '@/features/library';
import type { ReaderSettings } from '@app/shared';
import {
  applyReaderSettingsChange,
  fetchReaderPage,
  persistReaderProgress,
  ReaderScreen,
  readerQueryKeys,
  type ReaderPageData,
  type ReaderSettingsScope,
} from '@app/reader';
import { toChapterId, type ChapterId } from '@app/shared';
import {
  useLocalDb,
  useLocalDbRetry,
  useLocalDbStatus,
  useReportPersistenceError,
} from '../providers/local-db-provider.js';
import { failureMessage, feedback } from '../lib/app-feedback.js';
import { useOnlineStatus } from '../lib/use-online-status.js';
import { useCoalescedSettingsWrite } from '../lib/use-coalesced-settings-write.js';
import { useReaderPageShape } from '../lib/use-reader-page-shape.js';
import { getBindingForChapterId } from '../lib/provider-registry.js';
import { useLayoutStore } from '../stores/useLayoutStore.js';
import { ensureProviderChapterPages } from '../queries/provider-query-options.js';

export const Route = createFileRoute('/reader/$chapterId')({
  // Controls start hidden on every open (spec R8): set before the first render,
  // so the reader never paints its chrome and then hides it. A hover preload
  // is not an open.
  beforeLoad: ({ preload }) => {
    if (!preload) useLayoutStore.getState().setReaderChrome(false);
  },
  component: ReaderRoute,
});

const WRITE_FAILED = 'Your latest reading changes could not be saved.';

function ReaderRoute() {
  const { chapterId: chapterIdParam } = Route.useParams();
  return <ReaderRouteSession key={chapterIdParam} chapterIdParam={chapterIdParam} />;
}

/** Fills a locally empty chapter from its provider, then refreshes the local read. */
function useChapterHydration({
  chapterId,
  data,
  isDbReady,
}: {
  readonly chapterId: ChapterId;
  readonly data: ReaderPageData | null | undefined;
  readonly isDbReady: boolean;
}) {
  const queryClient = useQueryClient();
  const db = useLocalDb();

  const binding = getBindingForChapterId(chapterId);
  const hasLocalPages = (data?.chapter.pageCount ?? 0) > 0;
  // Hydrate only a locally empty chapter that a provider binding owns; the
  // command re-checks the same contracts before it reaches the network.
  const shouldHydrate = isDbReady && data != null && !hasLocalPages && binding !== null;

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
      return true;
    },
    meta: { feedback: { surface: 'inline' } },
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

  return { shouldHydrate, isHydrating, isHydrationError, hydrationFailed, retryHydration };
}

function ReaderRouteSession({ chapterIdParam }: { chapterIdParam: string }) {
  const chapterId = toChapterId(chapterIdParam);
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const reportPersistenceError = useReportPersistenceError();
  const readerChromeVisible = useLayoutStore((s) => s.readerChromeVisible);
  const toggleReaderChrome = useLayoutStore((s) => s.toggleReaderChrome);

  const isOnline = useOnlineStatus();
  const { data, isLoading, isError } = useQuery({
    queryKey: readerQueryKeys.chapter(chapterId),
    // Local-first: the reader renders SQLite only. Provider pages arrive through
    // the hydration command below, never from the read that gates the surface.
    // A chapter that is not on this device is `null`, never undefined.
    queryFn: async () => (await fetchReaderPage(db!, chapterId)) ?? null,
    enabled: dbStatus === 'ready' && db !== null,
    // Progress and chapter data change behind the reader's back (checkpoint on
    // leave, another tab); a cached mount must never show a stale page.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const { shouldHydrate, isHydrating, isHydrationError, hydrationFailed, retryHydration } =
    useChapterHydration({ chapterId, data, isDbReady: dbStatus === 'ready' && db !== null });
  const isMissingChapter = data === null;

  const { mutate: saveSettings } = useMutation({
    scope: { id: `reader-settings:${data?.mangaId ?? chapterId}` },
    // A snapshot of the reader data after the change, or null to reset the title.
    mutationFn: async (next: ReaderPageData | null) => {
      if (!data) return;
      if (next === null) {
        await resetTitleReaderSettings(db!, data.mangaId);
        return;
      }
      // The change carries its scope (R7): the snapshot holds the global row and
      // this title's choices as the quick panel left them.
      await saveReaderSettingsLayers(db!, data.mangaId, {
        globalSettings: next.globalSettings,
        titleOverrides: next.titleOverrides,
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      if (next === null) return;
      queryClient.setQueryData<ReaderPageData | null>(
        readerQueryKeys.chapter(chapterId),
        (current) =>
          current == null
            ? current
            : {
                ...current,
                settings: next.settings,
                engineSettings: next.engineSettings,
                ...(next.globalSettings !== undefined
                  ? { globalSettings: next.globalSettings }
                  : {}),
                ...(next.titleOverrides !== undefined
                  ? { titleOverrides: next.titleOverrides }
                  : {}),
              },
      );
    },
    onError: (error) => {
      // The cache already shows the attempted value; re-read the durable one.
      void queryClient.invalidateQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      // The reader has no shell banner above it; report through the same sink.
      feedback.log(error, 'reader settings');
      reportPersistenceError(failureMessage(error, WRITE_FAILED));
    },
    onSettled: (_data, _error, next) => {
      const current = queryClient.getQueryData<ReaderPageData | null>(
        readerQueryKeys.chapter(chapterId),
      )?.settings;
      // A newer edit owns the cache; its own write will invalidate.
      if (next !== null && current !== next.settings) return;
      void queryClient.invalidateQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  const settingsWriter = useCoalescedSettingsWrite(saveSettings);
  const handleChangeSettings = useCallback(
    (patch: Partial<ReaderSettings>, scope: ReaderSettingsScope) => {
      // Merge over the cache, not over the last render: two changes can land
      // before React re-renders with the first one.
      const current = queryClient.getQueryData<ReaderPageData | null>(
        readerQueryKeys.chapter(chapterId),
      );
      if (db === null || current == null) return;
      const next = applyReaderSettingsChange(current, patch, scope);
      // Paint every change; the DB write waits for the gesture to rest.
      queryClient.setQueryData<ReaderPageData | null>(readerQueryKeys.chapter(chapterId), next);
      settingsWriter.schedule(next);
    },
    [chapterId, db, queryClient, settingsWriter],
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
          feedback.log(error, 'reader progress');
          reportPersistenceError(failureMessage(error, WRITE_FAILED));
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
  const chapterActions = useReaderChapterActions(data ?? undefined, db, queryClient);
  // The first decode's Auto-to-strip decision survives chapter refetches: the
  // dimension write may not have landed, and stored ordinary pages must not
  // outvote what the reader already saw.
  const { data: readerData, onMeasured: handlePageMeasured } = useReaderPageShape({
    chapterId,
    db,
    queryClient,
    data,
  });

  return (
    <>
      <ReaderScreen
        key={chapterId}
        data={readerData ?? undefined}
        isLoading={dbStatus === 'loading' || isLoading}
        isError={dbStatus === 'error' || isError || isMissingChapter}
        isHydrating={isHydrating}
        isHydrationError={isHydrationError}
        chromeVisible={readerChromeVisible}
        onToggleChrome={toggleReaderChrome}
        onPersistProgress={handlePersistProgress}
        onChangeSettings={handleChangeSettings}
        onPageMeasured={handlePageMeasured}
        isOffline={!isOnline}
        onRetry={handleRetry}
        {...chapterActions}
        onResetSettings={() => {
          if (!db || !data) return;
          settingsWriter.cancel();
          saveSettings(null);
        }}
      />
    </>
  );
}

function useReaderChapterActions(
  data: ReaderPageData | undefined,
  db: AppDrizzleDb | null,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const navigate = useNavigate();
  const previous = data?.previousChapterId;
  const next = data?.nextChapterId;
  const handlePrevious = () => {
    if (previous) void navigate({ to: '/reader/$chapterId', params: { chapterId: previous } });
  };
  const handleNext = () => {
    if (next) void navigate({ to: '/reader/$chapterId', params: { chapterId: next } });
  };
  const handleClose = () => {
    if (data) {
      void navigate({ to: '/manga/$id', params: { id: data.mangaId } });
    } else {
      void navigate({ to: '/library' });
    }
  };
  // Read state and the library badge both derive from SQLite. The open reader
  // is deliberately not refetched: its page position is newer than the action,
  // and invalidating would re-run the progress effect with the old resume page.
  const afterWrite = async () => {
    await queryClient.invalidateQueries({
      queryKey: libraryQueryKeys.all,
      refetchType: 'none',
    });
  };
  return {
    onClose: handleClose,
    onMarkRead: async (completed: boolean) => {
      if (!db || !data) return;
      const result = await setChapterCompleted(db, data.chapterId, completed);
      if (!result.ok) throw new Error(result.error.message);
      await afterWrite();
    },
    onMarkPreviousRead: async () => {
      if (!db || !data) return;
      const result = await markPreviousChaptersCompleted(db, data.chapterId);
      if (!result.ok) throw new Error(result.error.message);
      await afterWrite();
    },
    onPreviousChapter: previous ? handlePrevious : undefined,
    onNextChapter: next ? handleNext : undefined,
  };
}
