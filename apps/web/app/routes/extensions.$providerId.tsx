import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extensionsQueryKeys,
  fetchProviderDetail,
  ProviderDetailPage,
  removeProvider,
  setProviderEnabled,
  updateProviderSettings,
} from '@app/extensions';
import type { ProviderSettingsValues } from '@app/shared';
import { useState } from 'react';
import { searchQueryKeys } from '@app/search';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { flushLocalDb } from '../lib/local-db.js';

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Could not save provider settings.';
}

export const Route = createFileRoute('/extensions/$providerId')({
  component: ProviderDetailRoute,
});

function ProviderDetailRoute() {
  const { providerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: extensionsQueryKeys.detail(providerId),
    queryFn: () => fetchProviderDetail(db!, providerId),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const result = await setProviderEnabled(db, providerId, enabled);
      if (!result.ok) {
        throw result.error;
      }
      // Durability point, mirroring the list route: a lost disable silently
      // resumes remote provider calls after a quick reload.
      await flushLocalDb();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.providers() });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: ProviderSettingsValues) => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const result = await updateProviderSettings(db, providerId, settings);
      if (!result.ok) {
        throw result.error;
      }
      // Durability point: settings must survive a reload and apply to the next
      // provider call instead of waiting for the coalesced flush window.
      await flushLocalDb();
      return result.value;
    },
    onSuccess: () => {
      setSettingsError(null);
      // Settings feed provider calls through query caches; an explicit save is
      // the one moment invalidating everything is both rare and correct.
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      setSettingsError(errorMessageOf(error));
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const result = await removeProvider(db, providerId);
      if (!result.ok) {
        throw result.error;
      }
      await flushLocalDb();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.providers() });
      void navigate({ to: '/extensions' });
    },
  });

  return (
    <ProviderDetailPage
      providerId={providerId}
      data={data}
      isLoading={dbStatus === 'loading' || isLoading}
      isError={dbStatus === 'error' || isError}
      isUpdating={toggleEnabledMutation.isPending || removeMutation.isPending}
      isSavingSettings={saveSettingsMutation.isPending}
      settingsSaved={saveSettingsMutation.isSuccess && settingsError === null}
      settingsError={settingsError}
      onBack={() => void navigate({ to: '/extensions' })}
      onToggleEnabled={(enabled) => {
        toggleEnabledMutation.mutate(enabled);
      }}
      onSaveSettings={(settings) => {
        saveSettingsMutation.mutate(settings);
      }}
      onRemove={() => {
        removeMutation.mutate();
      }}
    />
  );
}
