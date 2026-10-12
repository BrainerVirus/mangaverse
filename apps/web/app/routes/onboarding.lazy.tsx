import { createLazyFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OnboardingPage,
  advanceOnboardingStep,
  completeOnboarding,
  fetchOnboardingState,
  onboardingQueryKeys,
  resolveOnboardingEntryState,
  retreatOnboardingStep,
  saveOnboardingState,
  skipOnboarding,
} from '@app/onboarding';
import {
  fetchAppSettings,
  fetchReaderSettings,
  saveAppSettings,
  saveReaderSettings,
  settingsQueryKeys,
} from '@app/settings';
import type { AppSettings, ReaderSettings } from '@app/shared';
import { saveThemeSettings } from '@app/theme';

import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { useTheme } from '../providers/theme-provider.js';

export const Route = createLazyFileRoute('/onboarding')({
  component: OnboardingRoute,
});

function OnboardingRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const { settings: themeSettings, setThemeSettings, setThemeSaving } = useTheme();

  const onboardingQuery = useQuery({
    queryKey: onboardingQueryKeys.state(),
    queryFn: async () => {
      const state = await fetchOnboardingState(db!);
      return resolveOnboardingEntryState(state);
    },
    enabled: dbStatus === 'ready' && db !== null,
  });

  const appSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.app(),
    queryFn: () => fetchAppSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const readerSettingsQuery = useQuery({
    queryKey: settingsQueryKeys.reader(),
    queryFn: () => fetchReaderSettings(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const persistOnboarding = useMutation({
    mutationFn: async (nextState: Parameters<typeof saveOnboardingState>[1]) => {
      const result = await saveOnboardingState(db!, nextState);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return nextState;
    },
    onMutate: async (nextState) => {
      await queryClient.cancelQueries({ queryKey: onboardingQueryKeys.state() });
      const previous = queryClient.getQueryData(onboardingQueryKeys.state());
      queryClient.setQueryData(onboardingQueryKeys.state(), nextState);
      return { previous };
    },
    onError: (_error, _state, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(onboardingQueryKeys.state(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.state() });
    },
  });

  const persistTheme = useMutation({
    mutationFn: async (nextTheme: typeof themeSettings) => {
      setThemeSaving(true);
      const result = await saveThemeSettings(db!, nextTheme);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    },
    onSettled: () => {
      setThemeSaving(false);
    },
  });

  const persistAppSettings = useMutation({
    mutationFn: async (nextSettings: AppSettings) => {
      const result = await saveAppSettings(db!, nextSettings);
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

  const persistReaderSettings = useMutation({
    mutationFn: async (nextSettings: ReaderSettings) => {
      const result = await saveReaderSettings(db!, nextSettings);
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

  const isSaving =
    persistOnboarding.isPending ||
    persistTheme.isPending ||
    persistAppSettings.isPending ||
    persistReaderSettings.isPending;

  const isLoading =
    dbStatus === 'loading' ||
    onboardingQuery.isLoading ||
    appSettingsQuery.isLoading ||
    readerSettingsQuery.isLoading;

  const isError =
    dbStatus === 'error' ||
    onboardingQuery.isError ||
    appSettingsQuery.isError ||
    readerSettingsQuery.isError;

  const updateOnboarding = (
    nextState: Parameters<typeof saveOnboardingState>[1],
    onSaved?: () => void,
  ) => {
    persistOnboarding.mutate(nextState, {
      ...(onSaved !== undefined ? { onSuccess: onSaved } : {}),
    });
  };

  const finishOnboarding = () => {
    const current = onboardingQuery.data;
    if (current === undefined) {
      return;
    }

    updateOnboarding(completeOnboarding(current), () => {
      void navigate({ to: '/library' });
    });
  };

  return (
    <OnboardingPage
      state={onboardingQuery.data}
      themeSettings={themeSettings}
      appSettings={appSettingsQuery.data?.settings}
      readerSettings={readerSettingsQuery.data?.settings}
      isLoading={isLoading}
      isError={isError}
      isSaving={isSaving}
      onThemeChange={(next) => {
        setThemeSettings(next);
        persistTheme.mutate(next);
      }}
      onAppSettingsChange={(next) => persistAppSettings.mutate(next)}
      onReaderSettingsChange={(next) => persistReaderSettings.mutate(next)}
      onSkip={() => {
        const current = onboardingQuery.data;
        if (current === undefined) {
          return;
        }
        updateOnboarding(skipOnboarding(current), () => {
          void navigate({ to: '/library' });
        });
      }}
      onBack={() => {
        const current = onboardingQuery.data;
        if (current === undefined) {
          return;
        }
        updateOnboarding(retreatOnboardingStep(current));
      }}
      onNext={() => {
        const current = onboardingQuery.data;
        if (current === undefined) {
          return;
        }
        updateOnboarding(advanceOnboardingStep(current));
      }}
      onInstallProvider={() => {
        const current = onboardingQuery.data;
        if (current === undefined) {
          return;
        }
        updateOnboarding(completeOnboarding(current), () => {
          void navigate({ to: '/extensions', search: { install: true } });
        });
      }}
      onFinish={finishOnboarding}
    />
  );
}
