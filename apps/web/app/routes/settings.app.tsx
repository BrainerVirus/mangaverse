import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppSettingsPage, fetchAppSettings, saveAppSettings, settingsQueryKeys } from '@app/settings';
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
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
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
    },
  });

  return (
    <AppSettingsPage
      settings={data?.settings}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      isSaving={saveMutation.isPending}
      onChange={(next) => saveMutation.mutate(next)}
    />
  );
}
