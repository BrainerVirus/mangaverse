import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useRef, useState } from 'react';
import {
  DEFAULT_SEARCH_VIEW_STATE,
  mergeSearchPageData,
  parseSearchFilters,
  recordSearchQuery,
  SearchPage,
  searchQueryKeys,
  type SearchProviderResult,
  type SearchViewState,
} from '@app/search';
import { removeSavedSearch, upsertSavedSearch } from '@app/db/browser';
import type { SavedSearchEntry } from '@app/db';
import { fetchAppSettings, settingsQueryKeys } from '@/features/settings';
import { failureMessage } from '../lib/app-feedback.js';
import { getLocalDb } from '../lib/local-db.js';
import {
  savedSearchesQueryOptions,
  searchPageQueryOptions,
  searchProviderQueryOptions,
  searchProvidersQueryOptions,
} from '../queries/search-query-options.js';
import {
  refreshRecentSearches,
  refreshRecentSearchesAfterWrite,
} from '../queries/search-recents.js';
import type { SearchProviderInfo } from '../queries/provider-query-options.js';
import { useLocalDb, useLocalDbStatus, useLocalDbRetry } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/search')({
  component: SearchRoute,
});

/**
 * A saved search can name a provider that was since disabled or removed. Once
 * the list has loaded it is authoritative, so the stale selection falls back to
 * All providers instead of silently querying nobody.
 */
function resolveProviderSelection(
  viewState: SearchViewState,
  providers: readonly SearchProviderInfo[],
  providersSettled: boolean,
): { readonly providerId: string | undefined; readonly viewState: SearchViewState } {
  const selectedProviderId = viewState.filters?.providerId;
  if (
    selectedProviderId === undefined ||
    !providersSettled ||
    providers.some((provider) => provider.providerId === selectedProviderId)
  ) {
    return { providerId: selectedProviderId, viewState };
  }
  return {
    providerId: undefined,
    viewState: { ...viewState, filters: { ...(viewState.filters ?? {}), providerId: undefined } },
  };
}

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
  // Default to surfacing failures until the stored preference loads.
  const showProviderErrors = appSettingsQuery.data?.settings.showProviderErrors ?? true;
  // The input stays immediate. Local reads and provider calls follow the
  // deferred value, so a fast typist issues one query per pause instead of one
  // per keystroke.
  const deferredQuery = useDeferredValue(viewState.query);
  const providerReady = dbStatus === 'ready' && db !== null && appSettingsQuery.isSuccess;

  const providersQuery = useQuery({
    ...searchProvidersQueryOptions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const providers = providersQuery.data ?? [];
  const { providerId: activeProviderId, viewState: effectiveViewState } = resolveProviderSelection(
    viewState,
    providers,
    providersQuery.isSuccess,
  );
  const deferredViewState = { ...effectiveViewState, query: deferredQuery };
  const activeProviders =
    activeProviderId === undefined
      ? providers
      : providers.filter((provider) => provider.providerId === activeProviderId);

  const localQuery = useQuery({
    ...searchPageQueryOptions(db!, deferredViewState, explicitContent),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const providerQueries = useQueries({
    queries: activeProviders.map((provider) => ({
      ...searchProviderQueryOptions(
        db!,
        provider.providerId,
        deferredQuery,
        explicitContent,
        providerReady,
      ),
    })),
  });

  const savedSearchesQuery = useQuery({
    ...savedSearchesQueryOptions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });
  const savedSearches = savedSearchesQuery.data ?? [];

  const providerResults: SearchProviderResult[] = activeProviders.flatMap((provider, index) => {
    const data = providerQueries[index]?.data;
    return data === undefined ? [] : [{ providerId: provider.providerId, results: data }];
  });
  const providerStatuses = activeProviders.map((provider, index) => {
    const query = providerQueries[index];
    const error = query?.error;
    return {
      providerId: provider.providerId,
      label: provider.label,
      pending: query?.isFetching ?? false,
      ...(query?.isError === true
        ? { error: failureMessage(error, 'Provider search failed.') }
        : {}),
    };
  });

  const data = mergeSearchPageData(localQuery.data, providerResults, {
    filters: deferredViewState.filters,
    explicitContent,
  });

  const handleViewStateChange = (next: SearchViewState) => {
    setViewState(next);

    const trimmed = next.query.trim();
    if (trimmed.length === 0) {
      // Clearing the box shows recent searches. Wait for the last history write
      // before refreshing so the blank-query read cannot precede it.
      const pending = pendingSearchWrite.current;
      pendingSearchWrite.current = null;
      void refreshRecentSearchesAfterWrite(queryClient, pending);
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
    void write.then(() => refreshRecentSearches(queryClient));
  };

  const handleRetryProvider = (providerId: string) => {
    const index = activeProviders.findIndex((provider) => provider.providerId === providerId);
    void (index >= 0 ? providerQueries[index]?.refetch() : undefined);
  };

  const refreshSavedSearches = () =>
    queryClient.invalidateQueries({ queryKey: searchQueryKeys.savedSearches() });

  const handleSaveSearch = async (name: string) => {
    const trimmedName = name.trim();
    const query = viewState.query.trim();
    if (db === null || trimmedName.length === 0 || query.length === 0) return;

    const duplicate = savedSearches.find(
      (entry) => entry.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    await upsertSavedSearch(db, {
      ...(duplicate !== undefined ? { id: duplicate.id } : {}),
      name: trimmedName,
      query,
      filter: { ...(effectiveViewState.filters ?? {}) },
    });
    await refreshSavedSearches();
  };

  const handleDeleteSavedSearch = async (id: string) => {
    if (db === null) return;
    await removeSavedSearch(db, id);
    await refreshSavedSearches();
  };

  const handleApplySavedSearch = (entry: SavedSearchEntry) => {
    handleViewStateChange({
      query: entry.query,
      filters: parseSearchFilters(entry.filter),
    });
  };

  return (
    <SearchPage
      data={data}
      isLoading={dbStatus === 'loading' || localQuery.isLoading}
      isError={dbStatus === 'error' || localQuery.isError}
      providers={providers}
      providerStatuses={providerStatuses}
      savedSearches={savedSearches}
      showProviderErrors={showProviderErrors}
      explicitContent={explicitContent}
      onRetryProvider={handleRetryProvider}
      onSaveSearch={(name) => void handleSaveSearch(name)}
      onApplySavedSearch={handleApplySavedSearch}
      onDeleteSavedSearch={(id) => void handleDeleteSavedSearch(id)}
      viewState={effectiveViewState}
      onViewStateChange={handleViewStateChange}
      onOpenManga={(mangaId) => navigate({ to: '/manga/$id', params: { id: mangaId } })}
      onBrowseProviders={() => void navigate({ to: '/extensions' })}
      {...(dbStatus === 'error' ? { onRetry: retryDb } : {})}
    />
  );
}
