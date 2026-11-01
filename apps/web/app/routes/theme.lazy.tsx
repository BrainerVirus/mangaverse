import { createLazyFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCustomThemeId,
  deleteThemeDefinition,
  getBuiltInThemeDefinition,
  saveThemeDefinition,
  themeQueryKeys,
  ThemeCustomizationPage,
} from '@app/theme';
import type { ThemeDefinition } from '@app/shared';

import { failureMessage } from '../lib/app-feedback.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { useTheme } from '../providers/theme-provider.js';
import { themeSettingsAfterDelete } from '../components/theme/theme-selection.js';

export const Route = createLazyFileRoute('/theme')({
  component: ThemeRoute,
});

function ThemeRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const dbStatus = useLocalDbStatus();
  const db = useLocalDb();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    settings,
    setThemeSettings,
    isSaving,
    customThemes,
    isLoadingCustomThemes,
    isCustomThemesError,
    themeNotice,
    hydrateThemeDefinitions,
  } = useTheme();

  const duplicateMutation = useMutation({
    mutationFn: async (presetId: string): Promise<ThemeDefinition> => {
      if (db === null) {
        throw new Error('The local database is unavailable.');
      }
      const base = getBuiltInThemeDefinition(presetId);
      const result = await saveThemeDefinition(db, {
        ...base,
        id: createCustomThemeId(globalThis.crypto.randomUUID()),
        name: `${base.name} copy`,
        basedOn: presetId,
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    onSuccess: async (saved) => {
      // Keep the applied definition in sync before the selection moves, so the new
      // custom theme never flashes the missing-theme fallback during the refetch.
      hydrateThemeDefinitions([...customThemes.filter((theme) => theme.id !== saved.id), saved]);
      setThemeSettings({ ...settings, themeId: saved.id });
      await queryClient.invalidateQueries({ queryKey: themeQueryKeys.definitions() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (themeId: string): Promise<string> => {
      if (db === null) {
        throw new Error('The local database is unavailable.');
      }
      const result = await deleteThemeDefinition(db, themeId);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return themeId;
    },
    onSuccess: async (themeId) => {
      setThemeSettings(themeSettingsAfterDelete(settings, themeId));
      await queryClient.invalidateQueries({ queryKey: themeQueryKeys.definitions() });
    },
  });

  const failedAction = duplicateMutation.error ?? deleteMutation.error;
  const actionError =
    failedAction === null ? null : failureMessage(failedAction, 'Could not update this theme.');

  // `/theme/editor` is generated as a child of this route; the gallery is not a
  // layout, so the child owns the whole page whenever it is the active match.
  if (pathname === '/theme/editor') {
    return <Outlet />;
  }

  return (
    <ThemeCustomizationPage
      settings={settings}
      isLoading={dbStatus === 'loading'}
      isError={dbStatus === 'error'}
      isSaving={isSaving || duplicateMutation.isPending}
      customThemes={customThemes}
      areCustomThemesLoading={isLoadingCustomThemes}
      areCustomThemesError={isCustomThemesError}
      isDeletingCustomTheme={deleteMutation.isPending}
      themeNotice={themeNotice}
      actionError={actionError}
      onChange={setThemeSettings}
      onDuplicatePreset={(presetId) => duplicateMutation.mutate(presetId)}
      onEditCustomTheme={(themeId) => {
        if (settings.themeId !== themeId) {
          setThemeSettings({ ...settings, themeId });
        }
        void navigate({ to: '/theme/editor' });
      }}
      onDeleteCustomTheme={(themeId) => deleteMutation.mutate(themeId)}
      onRetryCustomThemes={() => {
        void queryClient.invalidateQueries({ queryKey: themeQueryKeys.definitions() });
      }}
    />
  );
}
