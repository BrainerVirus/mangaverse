import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCoverCacheUsage } from '@app/cache';
import { searchQueryKeys } from '@/features/search';
import { AppSettingsPage, saveAppSettings, settingsQueryKeys } from '@/features/settings';
import { saveFeedback } from '../lib/feedback.js';
import { appSettingsQueryOptions } from '../queries/settings-query-options.js';
import type { AppSettings } from '@app/shared';
import { useCoalescedSettingsWrite } from '../lib/use-coalesced-settings-write.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/settings/app')({
  component: SettingsAppRoute,
});

function SettingsAppRoute() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  const { data, isLoading, isError } = useQuery({
    ...appSettingsQueryOptions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const cacheUsageQuery = useQuery({
    queryKey: ['cache', 'usage'],
    queryFn: () => getCoverCacheUsage(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const saveMutation = useMutation({
    meta: saveFeedback('Could not save settings.'),
    mutationFn: async (settings: AppSettings) => {
      const result = await saveAppSettings(db!, settings);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onMutate: async (nextSettings) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.app() });
      queryClient.setQueryData(settingsQueryKeys.app(), { settings: nextSettings });
    },
    onError: () => {
      // The cache already shows the attempted value. Re-read the durable one
      // instead of rolling back to a snapshot taken after the optimistic write.
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.app() });
    },
    onSettled: (_data, _error, nextSettings) => {
      // A newer edit is already queued and owns the cache; refetching now would
      // briefly clobber it with the value that just landed.
      const current = queryClient.getQueryData<{ settings: AppSettings }>(
        settingsQueryKeys.app(),
      )?.settings;
      if (current !== nextSettings) return;
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.app() });
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });

  const settingsWriter = useCoalescedSettingsWrite(saveMutation.mutate);
  const handleChange = (next: AppSettings) => {
    // Keep the controls responsive on every edit; only the write is coalesced.
    queryClient.setQueryData(settingsQueryKeys.app(), { settings: next });
    settingsWriter.schedule(next);
  };

  return (
    <AppSettingsPage
      settings={data?.settings}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      {...(cacheUsageQuery.data !== undefined
        ? { cacheUsageBytes: cacheUsageQuery.data.totalBytes }
        : {})}
      onChange={handleChange}
      onInteractionEnd={() => settingsWriter.flush()}
    />
  );
}
