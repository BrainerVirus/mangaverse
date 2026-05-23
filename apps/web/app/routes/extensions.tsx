import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ExtensionInstallSession } from '@app/extensions';
import {
  createExtensionInstallSession,
  confirmProviderInstall,
  ExtensionsPage,
  extensionsQueryKeys,
  fetchExtensionsPage,
  InstallProviderDialog,
  prepareManualProviderInstall,
  setProviderEnabled,
  transitionExtensionInstall,
} from '@app/extensions';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createFileRoute('/extensions')({
  component: ExtensionsRoute,
});

function ExtensionsRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [installOpen, setInstallOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState('');
  const [installSession, setInstallSession] = useState<ExtensionInstallSession | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | undefined>(undefined);

  const { data, isLoading, isError } = useQuery({
    queryKey: extensionsQueryKeys.page(),
    queryFn: () => fetchExtensionsPage(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  const fetchManifestMutation = useMutation({
    mutationFn: async (url: string) => {
      const result = await prepareManualProviderInstall(url, { fetch: globalThis.fetch.bind(globalThis) });
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: (session) => {
      setInstallSession(session);
      if (session.step === 'manifestInvalid' && session.lastError !== undefined) {
        setInstallError(session.lastError.message);
      } else {
        setInstallError(null);
      }
    },
    onError: (error: Error) => {
      setInstallError(error.message);
    },
  });

  const confirmInstallMutation = useMutation({
    mutationFn: async (session: ExtensionInstallSession) => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      let next = await transitionExtensionInstall(session, { type: 'confirm' });
      setInstallSession(next);
      const result = await confirmProviderInstall(db, next);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      resetInstallState();
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
    },
    onError: (error: Error) => {
      setInstallError(error.message);
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ providerId, enabled }: { providerId: string; enabled: boolean }) => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      setPendingProviderId(providerId);
      const result = await setProviderEnabled(db, providerId, enabled);
      if (!result.ok) {
        throw result.error;
      }
    },
    onSettled: () => {
      setPendingProviderId(undefined);
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
    },
  });

  function resetInstallState() {
    setInstallOpen(false);
    setManifestUrl('');
    setInstallSession(null);
    setInstallError(null);
  }

  return (
    <>
      <ExtensionsPage
        data={data}
        isLoading={dbStatus === 'loading' || isLoading}
        isError={dbStatus === 'error' || isError}
        pendingProviderId={pendingProviderId}
        onOpenProvider={(providerId) =>
          void navigate({ to: '/extensions/$providerId', params: { providerId } })
        }
        onInstallProvider={() => {
          void createExtensionInstallSession().then((session) => {
            setInstallSession(session);
            setInstallError(null);
            setInstallOpen(true);
          });
        }}
        onToggleEnabled={(providerId, enabled) => {
          toggleEnabledMutation.mutate({ providerId, enabled });
        }}
      />

      <InstallProviderDialog
        open={installOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetInstallState();
            return;
          }
          setInstallOpen(true);
        }}
        manifestUrl={manifestUrl}
        onManifestUrlChange={setManifestUrl}
        session={installSession}
        isLoading={fetchManifestMutation.isPending}
        errorMessage={installError}
        onFetchManifest={() => {
          fetchManifestMutation.mutate(manifestUrl.trim());
        }}
        onConfirmInstall={() => {
          if (installSession !== null) {
            confirmInstallMutation.mutate(installSession);
          }
        }}
        onCancel={resetInstallState}
      />
    </>
  );
}
