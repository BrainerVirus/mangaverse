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

  const { mutate: saveSettings } = useMutation({
    mutationFn: async (next: ReaderSettings) => {
      const result = await saveReaderSettings(db!, next);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: readerQueryKeys.chapter(chapterId) });
      const previous = queryClient.getQueryData<ReaderPageData>(
        readerQueryKeys.chapter(chapterId),
      );
      queryClient.setQueryData<ReaderPageData>(readerQueryKeys.chapter(chapterId), (current) =>
        current === undefined
          ? current
          : { ...current, settings: next, engineSettings: toReaderEngineSettings(next) },
      );
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(readerQueryKeys.chapter(chapterId), context.previous);
      }
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
