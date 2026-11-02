import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchThemeDefinitions,
  fetchThemeSettings,
  saveThemeSettings,
  themeQueryKeys,
} from '@/features/theme';
import type { ThemeSettings } from '@app/shared';

import { useLocalDb, useLocalDbStatus } from './local-db-provider.js';
import { useTheme } from './theme-provider.js';

export function ThemeSettingsBridge() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const {
    hydrateThemeSettings,
    hydrateThemeDefinitions,
    registerThemeSettingsPersistence,
    setThemeSaving,
  } = useTheme();

  const { data } = useQuery({
    queryKey: themeQueryKeys.settings(),
    queryFn: () => fetchThemeSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const definitionsQuery = useQuery({
    queryKey: themeQueryKeys.definitions(),
    queryFn: () => fetchThemeDefinitions(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-cache-to-context-sync: the definitions arrive asynchronously and ThemeProvider owns the resolved definition; pushing the query result into that state is the same cache-to-context sync as the settings query above.
  useEffect(() => {
    hydrateThemeDefinitions(definitionsQuery.isError ? null : definitionsQuery.data);
  }, [definitionsQuery.data, definitionsQuery.isError, hydrateThemeDefinitions]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-cache-to-context-sync: the query result arrives asynchronously and must be pushed into ThemeProvider's context, which owns the state. Calling it during render would set a parent component's state from a child render.
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
      const previous = queryClient.getQueryData<{ settings: ThemeSettings }>(
        themeQueryKeys.settings(),
      );
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

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-sink-registration: pushes the persist callback into ThemeProvider's ref and clears it on unmount — subscription bookkeeping against a ref that lives in another component.
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
