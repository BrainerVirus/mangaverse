import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReaderSettingsPage, saveReaderSettings, settingsQueryKeys } from '@app/settings';
import { readerSettingsQueryOptions } from '../queries/settings-query-options.js';
import type { ReaderSettings } from '@app/shared';
import { useCoalescedSettingsWrite } from '../lib/use-coalesced-settings-write.js';
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
      queryClient.setQueryData(settingsQueryKeys.reader(), { settings: nextSettings });
    },
    onError: () => {
      // The cache already shows the attempted value; re-read the durable one.
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
    onSettled: (_data, _error, nextSettings) => {
      const current = queryClient.getQueryData<{ settings: ReaderSettings }>(
        settingsQueryKeys.reader(),
      )?.settings;
      // A newer edit owns the cache; its own write will invalidate.
      if (current !== nextSettings) return;
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  const settingsWriter = useCoalescedSettingsWrite(saveMutation.mutate);
  const handleChange = (next: ReaderSettings) => {
    // Every edit paints immediately; a slider gesture writes once at rest.
    queryClient.setQueryData(settingsQueryKeys.reader(), { settings: next });
    settingsWriter.schedule(next);
  };

  return (
    <ReaderSettingsPage
      settings={data?.settings}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      isSaving={saveMutation.isPending}
      onChange={handleChange}
      onInteractionEnd={() => settingsWriter.flush()}
    />
  );
}
