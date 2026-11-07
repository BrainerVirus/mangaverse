import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extensionsQueryKeys,
  fetchProviderDetail,
  ProviderDetailPage,
  removeProvider,
  setProviderEnabled,
  updateProviderSettings,
  type ProviderDetailData,
} from '@app/extensions';
import type { ProviderSettingsValues } from '@app/shared';
import { hasProviderCapability } from '@app/shared';
import { useState } from 'react';
import { searchQueryKeys } from '@/features/search';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { actionFailureMessage } from '../lib/app-feedback.js';
import { saveFeedback } from '../lib/feedback.js';
import { flushLocalDb } from '../lib/local-db.js';
import {
  revokeProviderNetworkAccess,
  syncProviderNetworkAllowlist,
} from '../lib/provider-allowlist-sync.js';
import { getProviderBinding } from '../lib/provider-registry.js';
import { goBackIfMarked } from '../lib/navigation-history.js';
import {
  useProviderActivity,
  useProviderHealth,
  useProviderUpdate,
} from '../lib/provider-operations.js';

function canProbeNetwork(data: ProviderDetailData | null | undefined): boolean {
  if (data === null || data === undefined) return false;
  return (
    hasProviderCapability(data.provider.manifest, 'discovery.search') &&
    getProviderBinding(String(data.provider.id))?.createProvider().search !== undefined
  );
}

export const Route = createFileRoute('/extensions/$providerId')({
  component: ProviderDetailRoute,
});

function ProviderDetailRoute() {
  const { providerId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: extensionsQueryKeys.detail(providerId),
    queryFn: () => fetchProviderDetail(db!, providerId),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const activity = useProviderActivity(db, providerId, dbStatus === 'ready');
  const health = useProviderHealth(db, providerId, {
    enabled: dbStatus === 'ready',
    manifest: data?.provider.manifest,
    canRunNetworkCheck: canProbeNetwork(data),
    lastCheckedAt: activity.lastHealthCheckAt,
  });
  const update = useProviderUpdate(db, providerId, dbStatus === 'ready');

  const toggleEnabledMutation = useMutation({
    meta: { feedback: { surface: 'toast', message: 'Could not update the provider.' } },
    mutationFn: async (enabled: boolean) => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const commit = async () => {
        const result = await setProviderEnabled(db, providerId, enabled);
        if (!result.ok) {
          throw result.error;
        }
        // Durability point, mirroring the list route: a lost disable silently
        // resumes remote provider calls after a quick reload.
        await flushLocalDb();
      };
      if (enabled) {
        await commit();
        // Main grants access only from a snapshot; a failed one fails the enable.
        await syncProviderNetworkAllowlist(db);
      } else {
        // Main loses access before the disable commits, or the disable fails.
        await revokeProviderNetworkAccess(providerId, commit);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.providers() });
    },
  });

  const saveSettingsMutation = useMutation({
    meta: saveFeedback('Could not save provider settings.', 'Settings saved'),
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
      setSettingsError(actionFailureMessage(error, 'Could not save provider settings.'));
    },
  });

  const removeMutation = useMutation({
    meta: { feedback: { surface: 'toast', message: 'Could not remove the provider.' } },
    mutationFn: async () => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      await revokeProviderNetworkAccess(providerId, async () => {
        const result = await removeProvider(db, providerId);
        if (!result.ok) {
          throw result.error;
        }
        await flushLocalDb();
      });
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
      activity={activity.state}
      health={health.state}
      update={update.state}
      onBack={() => {
        if (!goBackIfMarked(router.history, 'extensions'))
          void navigate({ to: '/extensions', replace: true });
      }}
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
