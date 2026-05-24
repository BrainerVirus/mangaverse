import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DEFAULT_LIBRARY_VIEW_STATE, LibraryPage } from '@app/library';
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
      onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
      onBrowse={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
