import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  DEFAULT_LIBRARY_VIEW_STATE,
  fetchLibraryPage,
  LibraryPage,
  libraryQueryKeys,
} from '@app/library';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/library')({
  component: LibraryRoute,
});

function LibraryRoute() {
  const navigate = useNavigate();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [viewState, setViewState] = useState(DEFAULT_LIBRARY_VIEW_STATE);

  const { data, isLoading, isError } = useQuery({
    queryKey: libraryQueryKeys.page(viewState),
    queryFn: () => fetchLibraryPage(db!, viewState),
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
    />
  );
}
