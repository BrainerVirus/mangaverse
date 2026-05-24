import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCoverCacheUsage } from '@app/cache';
import { searchQueryKeys } from '@app/search';
import { AppSettingsPage, saveAppSettings, settingsQueryKeys } from '@app/settings';
import { appSettingsQueryOptions } from '../queries/settings-query-options.js';
import type { AppSettings } from '@app/shared';
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
    mutationFn: async (settings: AppSettings) => {
      const result = await saveAppSettings(db!, settings);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onMutate: async (nextSettings) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.app() });
      const previous = queryClient.getQueryData<{ settings: AppSettings }>(settingsQueryKeys.app());
      queryClient.setQueryData(settingsQueryKeys.app(), { settings: nextSettings });
      return { previous };
    },
    onError: (_error, _settings, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(settingsQueryKeys.app(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.app() });
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });

  return (
    <AppSettingsPage
      settings={data?.settings}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      isSaving={saveMutation.isPending}
      {...(cacheUsageQuery.data !== undefined
        ? { cacheUsageBytes: cacheUsageQuery.data.totalBytes }
        : {})}
      onChange={(next) => saveMutation.mutate(next)}
    />
  );
}
