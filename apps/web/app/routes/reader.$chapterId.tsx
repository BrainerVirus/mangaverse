import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  fetchReaderPage,
  persistReaderProgress,
  ReaderScreen,
  readerQueryKeys,
} from '@app/reader';
import { toChapterId } from '@app/shared';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { useLayoutStore } from '../stores/useLayoutStore.js';

export const Route = createFileRoute('/reader/$chapterId')({
  component: ReaderRoute,
});

function ReaderRoute() {
  const { chapterId: chapterIdParam } = Route.useParams();
  const chapterId = toChapterId(chapterIdParam);
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const { readerChromeVisible, toggleReaderChrome } = useLayoutStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: readerQueryKeys.chapter(chapterId),
    queryFn: () => fetchReaderPage(db!, chapterId),
    enabled: dbStatus === 'ready' && db !== null,
  });

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
    />
  );
}
