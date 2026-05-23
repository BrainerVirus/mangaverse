import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReaderSettingsPage, saveReaderSettings, settingsQueryKeys } from '@app/settings';
import { readerSettingsQueryOptions } from '../queries/settings-query-options.js';
import type { ReaderSettings } from '@app/shared';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/settings/reader')({
  component: SettingsReaderRoute,
});

function SettingsReaderRoute() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();

  const { data, isLoading, isError } = useQuery({
    ...readerSettingsQueryOptions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: ReaderSettings) => {
      const result = await saveReaderSettings(db!, settings);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onMutate: async (nextSettings) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.reader() });
      const previous = queryClient.getQueryData<{ settings: ReaderSettings }>(settingsQueryKeys.reader());
      queryClient.setQueryData(settingsQueryKeys.reader(), { settings: nextSettings });
      return { previous };
    },
    onError: (_error, _settings, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(settingsQueryKeys.reader(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  return (
    <ReaderSettingsPage
      settings={data?.settings}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      isSaving={saveMutation.isPending}
      onChange={(next) => saveMutation.mutate(next)}
    />
  );
}
