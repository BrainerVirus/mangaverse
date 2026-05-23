import { createLazyFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createAppPlatformAdapter } from '@app/diagnostics';
import {
  StoragePage,
  clearStorageData,
  fetchStorageSummary,
  requestPersistentStorage,
  storageQueryKeys,
  type StorageClearTarget,
} from '@app/storage';

import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { usePlatform } from '../providers/platform-provider.js';

export const Route = createLazyFileRoute('/storage')({
  component: StorageRoute,
});

function StorageRoute() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const { capabilities } = usePlatform();
  const adapter = createAppPlatformAdapter();
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [lastActionError, setLastActionError] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: storageQueryKeys.summary(),
    queryFn: () =>
      fetchStorageSummary({
        db: db!,
        adapter,
        capabilities,
      }),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const clearMutation = useMutation({
    mutationFn: async (target: StorageClearTarget) => clearStorageData(db!, target),
    onSuccess: (result) => {
      setLastActionError(null);
      setLastActionMessage(`Cleared ${result.clearedCount} ${result.target === 'provider_cache' ? 'cache entries' : 'search history entries'}.`);
      void queryClient.invalidateQueries({ queryKey: storageQueryKeys.summary() });
    },
    onError: (error) => {
      setLastActionMessage(null);
      setLastActionError(error instanceof Error ? error.message : 'Could not clear storage data.');
    },
  });

  const persistMutation = useMutation({
    mutationFn: async () => {
      const result = await requestPersistentStorage(adapter, capabilities);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    onSuccess: (granted) => {
      setLastActionError(null);
      setLastActionMessage(granted ? 'Persistent storage granted.' : 'Persistent storage was not granted.');
      void queryClient.invalidateQueries({ queryKey: storageQueryKeys.summary() });
    },
    onError: (error) => {
      setLastActionMessage(null);
      setLastActionError(error instanceof Error ? error.message : 'Could not request persistent storage.');
    },
  });

  return (
    <StoragePage
      isLoading={dbStatus === 'loading' || summaryQuery.isLoading}
      isError={dbStatus === 'error' || summaryQuery.isError}
      isRefreshing={summaryQuery.isFetching && !summaryQuery.isLoading}
      isClearing={clearMutation.isPending}
      isRequestingPersist={persistMutation.isPending}
      summary={summaryQuery.data ?? null}
      capabilities={capabilities}
      lastActionMessage={lastActionMessage}
      lastActionError={lastActionError}
      onRefresh={() => {
        void summaryQuery.refetch();
      }}
      onClear={(target) => clearMutation.mutate(target)}
      onRequestPersistentStorage={() => persistMutation.mutate()}
      onDismissActionStatus={() => {
        setLastActionMessage(null);
        setLastActionError(null);
      }}
    />
  );
}
