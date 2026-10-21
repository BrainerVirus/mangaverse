import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { DEFAULT_LIBRARY_VIEW_STATE, LibraryPage } from '@app/library';
import type { MangaId } from '@app/shared';
import { libraryPageQueryOptions } from '../queries/library-query-options.js';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/library')({
  component: LibraryRoute,
});

function LibraryRoute() {
  const navigate = useNavigate();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const [viewState, setViewState] = useState(DEFAULT_LIBRARY_VIEW_STATE);
  const openManga = useCallback(
    (mangaId: MangaId) => {
      void navigate({ to: '/manga/$id', params: { id: mangaId } });
    },
    [navigate],
  );

  const { data, isLoading, isError } = useQuery({
    ...libraryPageQueryOptions(db!, viewState),
    enabled: dbStatus === 'ready' && db !== null,
  });

  return (
    <LibraryPage
      data={data}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      viewState={viewState}
      onViewStateChange={setViewState}
      onOpenManga={openManga}
      onBrowse={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
