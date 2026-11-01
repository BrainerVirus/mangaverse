import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchReaderSettings,
  ReaderSettingsPage,
  saveReaderSettings,
  saveTitleReaderSettings,
  settingsQueryKeys,
} from '@app/settings';
import { getTitleReaderSettings, resetTitleReaderSettings } from '@app/db';
import type { ReaderSettings } from '@app/shared';
import { saveFeedback } from '../lib/feedback.js';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from '../queries/query-timing.js';
import { useCoalescedSettingsWrite } from '../lib/use-coalesced-settings-write.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/settings/reader')({
  component: SettingsReaderRoute,
  validateSearch: (search: Record<string, unknown>): { title?: string } =>
    typeof search.title === 'string' && search.title.trim().length > 0
      ? { title: search.title.trim() }
      : {},
});

function SettingsReaderRoute() {
  const { title } = Route.useSearch();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const isTitleScoped = title !== undefined;
  const queryKey = isTitleScoped
    ? ([...settingsQueryKeys.reader(), 'title', title] as const)
    : settingsQueryKeys.reader();

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      if (db === null) throw new Error('Local database is not ready.');
      if (title === undefined) return fetchReaderSettings(db);
      return { settings: await getTitleReaderSettings(db, title) };
    },
    enabled: dbStatus === 'ready' && db !== null,
    staleTime: QUERY_STALE_TIMES.settings,
    gcTime: QUERY_GC_TIMES.settings,
  });

  const saveMutation = useMutation({
    meta: saveFeedback('Could not save settings.'),
    // One write at a time: a burst of coalesced edits can otherwise resolve out
    // of order and the last snapshot to land would not be the last value painted.
    scope: { id: isTitleScoped ? `reader-settings:${title}` : 'reader-settings' },
    mutationFn: async (settings: ReaderSettings) => {
      if (db === null) throw new Error('Local database is not ready.');
      if (title !== undefined && settings.rememberPerTitleOverrides) {
        await saveTitleReaderSettings(db, title, settings);
        return;
      }
      const result = await saveReaderSettings(db, settings);
      if (!result.ok) throw new Error(result.error.message);
    },
    onMutate: async (nextSettings) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, { settings: nextSettings });
    },
    onError: () => {
      // The cache already shows the attempted value; re-read the durable one.
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
    onSettled: (_data, _error, nextSettings) => {
      const current = queryClient.getQueryData<{ settings: ReaderSettings }>(queryKey)?.settings;
      // A newer edit owns the cache; its own write will invalidate.
      if (current !== nextSettings) return;
      // `reader()` also matches the title key, and the title helper may have
      // enabled the global remember flag.
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  const resetMutation = useMutation({
    meta: saveFeedback('Could not reset settings.'),
    mutationFn: async () => {
      if (db === null || title === undefined) throw new Error('Local database is not ready.');
      await resetTitleReaderSettings(db, title);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  const settingsWriter = useCoalescedSettingsWrite(saveMutation.mutate);
  const handleChange = (patch: Partial<ReaderSettings>) => {
    // Merge over the cache, not over the last render: a control can change
    // before React has re-rendered with the previous edit's new settings.
    const current = queryClient.getQueryData<{ settings: ReaderSettings }>(queryKey)?.settings;
    if (current === undefined) return;
    const next = { ...current, ...patch };
    // Every edit paints immediately; a slider gesture writes once at rest.
    queryClient.setQueryData(queryKey, { settings: next });
    settingsWriter.schedule(next);
  };

  return (
    <ReaderSettingsPage
      settings={data?.settings}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      onChange={handleChange}
      onInteractionEnd={() => settingsWriter.flush()}
      {...(isTitleScoped
        ? {
            titleScope: {
              onReset: () => resetMutation.mutate(),
              isResetting: resetMutation.isPending,
            },
          }
        : {})}
    />
  );
}
