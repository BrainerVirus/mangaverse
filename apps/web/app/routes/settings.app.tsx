import { useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCoverCacheUsage } from '@app/cache';
import { validateAppSettings, type AppSettings } from '@app/shared';
import { searchQueryKeys } from '@/features/search';
import { AppSettingsPage, saveAppSettings, settingsQueryKeys } from '@/features/settings';
import { saveFeedback } from '../lib/feedback.js';
import { appSettingsQueryOptions } from '../queries/settings-query-options.js';
import { useCoalescedSettingsWrite } from '../lib/use-coalesced-settings-write.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/settings/app')({
  component: SettingsAppRoute,
});

function SettingsAppRoute() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const cacheEdits = useRef(new WeakSet<AppSettings>());
  const latestEdit = useRef<AppSettings | null>(null);

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
      const result = await saveAppSettings(db!, settings).catch((cause: unknown) => {
        const error = new Error('Local settings storage failed.', { cause });
        if (cacheEdits.current.has(settings)) error.name = 'CacheLimitSaveError';
        throw error;
      });
      if (!result.ok) {
        const error = new Error(result.error.message);
        if (cacheEdits.current.has(settings)) error.name = 'CacheLimitSaveError';
        throw error;
      }
    },
    onSettled: (_data, _error, nextSettings) => {
      // A newer edit is already queued and owns the cache; refetching now would
      // briefly clobber it with the value that just landed.
      if (latestEdit.current !== nextSettings) return;
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.app() });
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });

  const settingsWriter = useCoalescedSettingsWrite(saveMutation.mutate);
  const handleChange = (next: AppSettings, field?: 'cache') => {
    if (!validateAppSettings(next).ok) return;
    if (field === 'cache') cacheEdits.current.add(next);
    latestEdit.current = next;
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
      cacheSaveError={saveMutation.error?.name === 'CacheLimitSaveError'}
    />
  );
}
