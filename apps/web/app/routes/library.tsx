import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { DEFAULT_LIBRARY_VIEW_STATE, LibraryPage } from '@app/library';
import type { LibraryViewState, MangaId } from '@app/shared';
import { libraryPageQueryOptions } from '../queries/library-query-options.js';
import { createLibraryOrganizationMutationOptions } from '../queries/library-mutation-options.js';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/library')({
  component: LibraryRoute,
});

function LibraryRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const [viewState, setViewState] = useState<LibraryViewState>(DEFAULT_LIBRARY_VIEW_STATE);
  const organizeMutation = useMutation(createLibraryOrganizationMutationOptions(db, queryClient));
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
      onOrganize={(action) => organizeMutation.mutateAsync(action)}
      onBrowse={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
