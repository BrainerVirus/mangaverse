import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  DEFAULT_SEARCH_VIEW_STATE,
  mergeSearchPageData,
  recordSearchQuery,
  SearchPage,
  type SearchViewState,
} from '@app/search';
import { fetchAppSettings, settingsQueryKeys } from '@app/settings';
import { getLocalDb } from '../lib/local-db.js';
import {
  searchPageQueryOptions,
  searchProviderQueryOptions,
} from '../queries/search-query-options.js';
import {
  refreshRecentSearches,
  refreshRecentSearchesAfterWrite,
} from '../queries/search-recents.js';
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
  const pendingSearchWrite = useRef<Promise<void> | null>(null);

  const appSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const explicitContent = appSettingsQuery.data?.settings.explicitContent ?? false;
  const searchReady = dbStatus === 'ready' && db !== null && appSettingsQuery.isSuccess;

  const localQuery = useQuery({
    ...searchPageQueryOptions(db!, viewState, explicitContent),
    enabled: searchReady,
  });

  const providerQuery = useQuery({
    ...searchProviderQueryOptions(db!, viewState.query, explicitContent, searchReady),
  });

  const data = mergeSearchPageData(localQuery.data, providerQuery.data);

  const handleViewStateChange = (next: SearchViewState) => {
    setViewState(next);

    const trimmed = next.query.trim();
    if (trimmed.length === 0) {
      // Clearing the box shows recent searches. Wait for the last history write
      // before refreshing so the blank-query read cannot precede it.
      const pending = pendingSearchWrite.current;
      pendingSearchWrite.current = null;
      void refreshRecentSearchesAfterWrite(queryClient, pending, explicitContent);
      return;
    }
    if (dbStatus === 'error' || trimmed === lastRecordedQuery.current) {
      return;
    }

    lastRecordedQuery.current = trimmed;
    // The first query can be typed before the DB finishes opening; record
    // against the session promise so that search still reaches history.
    const write = recordSearchQuery(db ?? getLocalDb(), trimmed).catch(() => undefined);
    pendingSearchWrite.current = write;
    void write.then(() => refreshRecentSearches(queryClient, explicitContent));
  };

  return (
    <SearchPage
      data={data}
      isLoading={dbStatus === 'loading' || localQuery.isLoading || appSettingsQuery.isLoading}
      isError={dbStatus === 'error' || localQuery.isError}
      isProviderPending={providerQuery.isFetching}
      isProviderError={providerQuery.isError}
      onRetryProvider={() => void providerQuery.refetch()}
      viewState={viewState}
      onViewStateChange={handleViewStateChange}
      onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
