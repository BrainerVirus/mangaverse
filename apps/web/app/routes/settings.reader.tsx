import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchReaderSettings,
  READER_SETTINGS_MUTATION_SCOPE,
  ReaderSettingsPage,
  saveReaderSettings,
  saveTitleReaderSettings,
  settingsQueryKeys,
} from '@/features/settings';
import { getReaderSettings, getTitleReaderSettingsLayers, resetTitleReaderSettings } from '@app/db';
import type { ReaderSettings, ReaderSettingsOverride } from '@app/shared';
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

/** The page's data: a title page also keeps the title's own choices. */
interface ReaderSettingsPageState {
  readonly settings: ReaderSettings;
  readonly overrides?: ReaderSettingsOverride;
}

type ReaderSettingsSaveVars = {
  readonly next: ReaderSettingsPageState;
  readonly patch: Partial<ReaderSettings>;
};

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
      const layers = await getTitleReaderSettingsLayers(db, title);
      return { settings: layers.settings, overrides: layers.overrides };
    },
    enabled: dbStatus === 'ready' && db !== null,
    staleTime: QUERY_STALE_TIMES.settings,
    gcTime: QUERY_GC_TIMES.settings,
  });

  const saveMutation = useMutation({
    meta: saveFeedback('Could not save settings.'),
    // One write at a time across reader surfaces, so a burst of coalesced edits
    // cannot resolve out of order and the last snapshot to land is the newest.
    scope: { id: READER_SETTINGS_MUTATION_SCOPE },
    // `?title=` edits that title's choices; the plain page edits the global row.
    // The patch is merged into the latest durable row, never a stale page snapshot,
    // so a concurrent edit to another field is preserved.
    mutationFn: async ({ patch }: ReaderSettingsSaveVars) => {
      if (db === null) throw new Error('Local database is not ready.');
      if (title !== undefined) {
        const layers = await getTitleReaderSettingsLayers(db, title);
        await saveTitleReaderSettings(db, title, { ...layers.overrides, ...patch });
        return;
      }
      const result = await saveReaderSettings(db, { ...(await getReaderSettings(db)), ...patch });
      if (!result.ok) throw new Error(result.error.message);
    },
    onMutate: async ({ next }) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, next);
    },
    onError: () => {
      // The cache already shows the attempted value; re-read the durable one.
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
    onSettled: (_data, _error, { next }) => {
      const current = queryClient.getQueryData<ReaderSettingsPageState>(queryKey);
      // A newer edit owns the cache; its own write will invalidate.
      if (current !== next) return;
      // `reader()` also matches the title key.
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  const resetMutation = useMutation({
    meta: saveFeedback('Could not reset settings.'),
    // Same shared mutation scope as every save: a reset queues behind a write
    // already in flight and runs last, so a delayed save cannot recreate the
    // row the reset just deleted.
    scope: { id: READER_SETTINGS_MUTATION_SCOPE },
    mutationFn: async () => {
      if (db === null || title === undefined) throw new Error('Local database is not ready.');
      await resetTitleReaderSettings(db, title);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.reader() });
    },
  });

  const settingsWriter = useCoalescedSettingsWrite(saveMutation.mutate);
  const handleChange = (patch: Partial<ReaderSettings>) => {
    // Merge over the cache, not over the last render: a control can change
    // before React has re-rendered with the previous edit's new settings.
    const current = queryClient.getQueryData<ReaderSettingsPageState>(queryKey);
    if (current === undefined) return;
    const next: ReaderSettingsPageState = {
      settings: { ...current.settings, ...patch },
      ...(isTitleScoped ? { overrides: { ...current.overrides, ...patch } } : {}),
    };
    // Every edit paints immediately; a slider gesture writes once at rest.
    queryClient.setQueryData(queryKey, next);
    settingsWriter.schedule({ next, patch });
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
              onReset: () => {
                // Drop this page's queued edit before the reset; the shared
                // mutation scope fences anything already in flight.
                settingsWriter.cancel();
                resetMutation.mutate();
              },
              isResetting: resetMutation.isPending,
            },
          }
        : {})}
    />
  );
}
