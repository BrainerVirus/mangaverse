import { createLazyFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toChapterId } from '@app/shared';
import { createAppPlatformAdapter } from '@/features/diagnostics/index.js';
import { useDownloadEngine } from '@/features/downloads/index.js';
import {
  StoragePage,
  clearStorageData,
  fetchStorageSummary,
  requestPersistentStorage,
  storageQueryKeys,
  type StorageClearTarget,
} from '@/features/storage/index.js';

import { failureMessage } from '../lib/app-feedback.js';
import { saveFeedback } from '../lib/feedback.js';
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
  const downloadEngine = useDownloadEngine();
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
    mutationFn: async (target: StorageClearTarget) =>
      clearStorageData({ db: db!, adapter, target }),
    onSuccess: (result) => {
      const label = result.target === 'provider_cache' ? 'cache entries' : 'search history entries';
      if (result.failedCount > 0) {
        setLastActionMessage(null);
        setLastActionError(
          `Cleared ${result.clearedCount} ${label}, but ${result.failedCount} could not be cleared because their cached images could not be deleted. They were kept so you can retry.`,
        );
      } else {
        setLastActionError(null);
        const reclaimed =
          result.reclaimedBlobs > 0
            ? ` Reclaimed ${result.reclaimedBlobs} orphaned cached images.`
            : '';
        setLastActionMessage(`Cleared ${result.clearedCount} ${label}.${reclaimed}`);
      }
      void queryClient.invalidateQueries({ queryKey: storageQueryKeys.summary() });
    },
    onError: (error) => {
      setLastActionMessage(null);
      setLastActionError(failureMessage(error, 'Could not clear storage data.'));
    },
  });

  const persistMutation = useMutation({
    meta: saveFeedback('Could not request persistent storage.'),
    mutationFn: async () => {
      const result = await requestPersistentStorage(adapter, capabilities);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    onSuccess: (granted) => {
      setLastActionError(null);
      setLastActionMessage(
        granted ? 'Persistent storage granted.' : 'Persistent storage was not granted.',
      );
      void queryClient.invalidateQueries({ queryKey: storageQueryKeys.summary() });
    },
    onError: () => {
      setLastActionMessage(null);
    },
  });

  const removeDownloadMutation = useMutation({
    mutationFn: async (chapterId: string) => {
      if (downloadEngine === null) throw new Error('Downloads are not ready.');
      return downloadEngine.remove(toChapterId(chapterId));
    },
    onSuccess: (result) => {
      setLastActionError(null);
      setLastActionMessage(
        `Removed the download: ${result.removedPages} page${result.removedPages === 1 ? '' : 's'} freed.`,
      );
    },
    onError: (error) => {
      setLastActionMessage(null);
      setLastActionError(failureMessage(error, 'Could not remove the download.'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: storageQueryKeys.summary() });
    },
  });

  async function retryDownload(chapterId: string): Promise<void> {
    if (downloadEngine === null) return;
    await downloadEngine
      .retry(toChapterId(chapterId))
      .then(
        () => {
          setLastActionError(null);
          setLastActionMessage('Resuming the download.');
        },
        (error: unknown) => {
          setLastActionMessage(null);
          setLastActionError(failureMessage(error, 'Could not resume the download.'));
        },
      )
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: storageQueryKeys.summary() });
      });
  }

  return (
    <StoragePage
      isLoading={dbStatus === 'loading' || summaryQuery.isLoading}
      isError={dbStatus === 'error' || summaryQuery.isError}
      isRefreshing={summaryQuery.isFetching && !summaryQuery.isLoading}
      isClearing={clearMutation.isPending}
      isRequestingPersist={persistMutation.isPending}
      isDownloadActionPending={removeDownloadMutation.isPending}
      summary={summaryQuery.data ?? null}
      capabilities={capabilities}
      lastActionMessage={lastActionMessage}
      lastActionError={lastActionError}
      onRefresh={() => {
        void summaryQuery.refetch();
      }}
      onClear={(target) => clearMutation.mutate(target)}
      onRequestPersistentStorage={() => persistMutation.mutate()}
      onRetryDownload={(chapterId) => void retryDownload(chapterId)}
      onRemoveDownload={(chapterId) => removeDownloadMutation.mutate(chapterId)}
      onDismissActionStatus={() => {
        setLastActionMessage(null);
        setLastActionError(null);
      }}
    />
  );
}
