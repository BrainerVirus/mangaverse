import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchThemeSettings, saveThemeSettings, themeQueryKeys } from '@app/theme';
import type { ThemeSettings } from '@app/shared';

import { useLocalDb, useLocalDbStatus } from './local-db-provider.js';
import { useTheme } from './theme-provider.js';

export function ThemeSettingsBridge() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const { hydrateThemeSettings, registerThemeSettingsPersistence, setThemeSaving } = useTheme();

  const { data } = useQuery({
    queryKey: themeQueryKeys.settings(),
    queryFn: () => fetchThemeSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  useEffect(() => {
    if (data?.settings) {
      hydrateThemeSettings(data.settings);
    }
  }, [data?.settings, hydrateThemeSettings]);

  const saveMutation = useMutation({
    mutationFn: async (nextSettings: ThemeSettings) => {
      if (db === null) {
        return nextSettings;
      }
      const result = await saveThemeSettings(db, nextSettings);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return nextSettings;
    },
    onMutate: async (nextSettings) => {
      setThemeSaving(true);
      await queryClient.cancelQueries({ queryKey: themeQueryKeys.settings() });
      const previous = queryClient.getQueryData<{ settings: ThemeSettings }>(themeQueryKeys.settings());
      queryClient.setQueryData(themeQueryKeys.settings(), { settings: nextSettings });
      return { previous };
    },
    onError: (_error, _settings, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(themeQueryKeys.settings(), context.previous);
      }
    },
    onSettled: () => {
      setThemeSaving(false);
      if (db !== null) {
        void queryClient.invalidateQueries({ queryKey: themeQueryKeys.settings() });
      }
    },
  });

  useEffect(() => {
    registerThemeSettingsPersistence((nextSettings) => {
      if (db === null || dbStatus !== 'ready') {
        return;
      }
      saveMutation.mutate(nextSettings);
    });

    return () => registerThemeSettingsPersistence(null);
  }, [db, dbStatus, registerThemeSettingsPersistence, saveMutation]);

  return null;
}
