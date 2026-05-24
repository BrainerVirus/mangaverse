import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SEARCH_VIEW_STATE,
  recordSearchQuery,
  SearchPage,
  searchQueryKeys,
} from '@app/search';
import { searchPageQueryOptions } from '../queries/search-query-options.js';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/search')({
  component: SearchRoute,
});

function SearchRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const retryDb = useLocalDbRetry();
  const [viewState, setViewState] = useState(DEFAULT_SEARCH_VIEW_STATE);
  const lastRecordedQuery = useRef('');

  const { data, isLoading, isError } = useQuery({
    ...searchPageQueryOptions(db!, viewState),
    enabled: dbStatus === 'ready' && db !== null,
  });

  useEffect(() => {
    const trimmed = viewState.query.trim();
    if (trimmed.length === 0 || db === null || dbStatus !== 'ready') {
      return;
    }
    if (trimmed === lastRecordedQuery.current) {
      return;
    }

    lastRecordedQuery.current = trimmed;
    void recordSearchQuery(db, trimmed).then(() => {
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.all });
    });
  }, [db, dbStatus, queryClient, viewState.query]);

  return (
    <SearchPage
      data={data}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      viewState={viewState}
      onViewStateChange={setViewState}
      onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
