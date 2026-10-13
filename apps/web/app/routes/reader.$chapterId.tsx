import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { upsertReaderSettings } from '@app/db/browser';
import type { ReaderSettings } from '@app/shared';
import {
  fetchReaderPage,
  persistReaderProgress,
  ReaderScreen,
  readerQueryKeys,
} from '@app/reader';
import { toChapterId } from '@app/shared';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { useOnlineStatus } from '../lib/use-online-status.js';
import { useLayoutStore } from '../stores/useLayoutStore.js';
import { ensureMangadexChapterPages } from '../queries/mangadex-query-options.js';

export const Route = createFileRoute('/reader/$chapterId')({
  component: ReaderRoute,
});

function ReaderRoute() {
  const { chapterId: chapterIdParam } = Route.useParams();
  const chapterId = toChapterId(chapterIdParam);
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const { readerChromeVisible, toggleReaderChrome } = useLayoutStore();

  const isOnline = useOnlineStatus();
  const { data, isLoading, isError } = useQuery({
    queryKey: readerQueryKeys.chapter(chapterId),
    queryFn: async ({ signal }) => {
      await ensureMangadexChapterPages(db!, chapterId, signal);
      return fetchReaderPage(db!, chapterId);
    },
    enabled: dbStatus === 'ready' && db !== null,
    // Progress and chapter data change behind the reader's back (checkpoint on
    // leave, another tab); a cached mount must never show a stale page.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const handleChangeSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      if (db === null || data?.settings === undefined) return;
      void upsertReaderSettings(db, { ...data.settings, ...patch }).then(() => {
        void queryClient.invalidateQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      });
    },
    [chapterId, data?.settings, db, queryClient],
  );

  const handlePersistProgress = useCallback(
    (event: Parameters<typeof persistReaderProgress>[1]) => {
      if (db === null) return;
      void persistReaderProgress(db, event);
    },
    [db],
  );

  return (
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
        void queryClient.invalidateQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      }}
    />
  );
}
