import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  DEFAULT_SEARCH_VIEW_STATE,
  recordSearchQuery,
  SearchPage,
  searchQueryKeys,
  type SearchViewState,
} from '@app/search';
import { fetchAppSettings, settingsQueryKeys } from '@app/settings';
import { searchPageQueryOptions } from '../queries/search-query-options.js';
import { refreshRecentSearches } from '../queries/search-recents.js';
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

  const appSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const explicitContent = appSettingsQuery.data?.settings.explicitContent ?? false;

  const { data, isLoading, isError } = useQuery({
    ...searchPageQueryOptions(db!, viewState, explicitContent),
    enabled: dbStatus === 'ready' && db !== null && appSettingsQuery.isSuccess,
  });

  const handleViewStateChange = (next: SearchViewState) => {
    setViewState(next);

    const trimmed = next.query.trim();
    if (trimmed.length === 0) {
      // Clearing the box shows recent searches; refetch them so a just-recorded
      // query cannot be hidden by a blank-query result cached during hydration.
      if (db !== null && dbStatus === 'ready') {
        void refreshRecentSearches(queryClient);
      }
      return;
    }
    if (db === null || dbStatus !== 'ready') {
      return;
    }
    if (trimmed === lastRecordedQuery.current) {
      return;
    }

    lastRecordedQuery.current = trimmed;
    void recordSearchQuery(db, trimmed).then(() => {
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.all });
    });
  };

  return (
    <SearchPage
      data={data}
      isLoading={dbStatus === 'loading' || isLoading || appSettingsQuery.isLoading}
      isError={dbStatus === 'error' || isError}
      viewState={viewState}
      onViewStateChange={handleViewStateChange}
      onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
