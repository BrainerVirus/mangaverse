import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ExtensionInstallSession } from '@app/extensions';
import {
  confirmProviderInstall,
  createExtensionInstallSession,
  ExtensionsPage,
  extensionsQueryKeys,
  fetchExtensionsPage,
  InstallProviderDialog,
  prepareManualProviderInstall,
  setProviderEnabled,
  transitionExtensionInstall,
} from '@app/extensions';
import { getDevMangaDexManifestUrl } from '../lib/dev-seed-mangadex.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

type ExtensionsSearch = {
  install?: boolean;
};

export const Route = createFileRoute('/extensions')({
  validateSearch: (search: Record<string, unknown>): ExtensionsSearch => ({
    install: search.install === true || search.install === '1' || search.install === 1,
  }),
  component: ExtensionsRoute,
});

function ExtensionsRoute() {
  const navigate = useNavigate({ from: '/extensions' });
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [installOpen, setInstallOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState('');
  const [installSession, setInstallSession] = useState<ExtensionInstallSession | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | undefined>(undefined);
  const autoInstallStarted = useRef(false);

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
      let next = transitionExtensionInstall(session, { type: 'confirm' });
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
      void navigate({ search: {} });
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
    autoInstallStarted.current = false;
  }

  function openInstallDialog(prefillUrl?: string) {
    setInstallSession(createExtensionInstallSession());
    setInstallError(null);
    setInstallOpen(true);
    if (prefillUrl !== undefined) {
      setManifestUrl(prefillUrl);
    }
  }

  useEffect(() => {
    if (!search.install) {
      autoInstallStarted.current = false;
      return;
    }
    if (dbStatus !== 'ready' || autoInstallStarted.current) {
      return;
    }

    autoInstallStarted.current = true;
    const devManifestUrl = import.meta.env.DEV ? getDevMangaDexManifestUrl() : undefined;
    openInstallDialog(devManifestUrl);
    if (devManifestUrl !== undefined) {
      fetchManifestMutation.mutate(devManifestUrl);
    }
  }, [search.install, dbStatus]);

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
          void navigate({ search: { install: true } });
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
            void navigate({ search: {} });
            return;
          }
          setInstallOpen(true);
        }}
        manifestUrl={manifestUrl}
        onManifestUrlChange={setManifestUrl}
        session={installSession}
        isLoading={fetchManifestMutation.isPending || confirmInstallMutation.isPending}
        errorMessage={installError}
        onFetchManifest={() => {
          fetchManifestMutation.mutate(manifestUrl.trim());
        }}
        onConfirmInstall={() => {
          if (installSession !== null) {
            confirmInstallMutation.mutate(installSession);
          }
        }}
        onCancel={() => {
          resetInstallState();
          void navigate({ search: {} });
        }}
      />
    </>
  );
}
