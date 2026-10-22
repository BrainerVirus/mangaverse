import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { ExtensionInstallSession, ExtensionRegistryImportResult } from '@app/extensions';
import {
  confirmProviderInstall,
  createExtensionInstallSession,
  exportExtensionRegistryData,
  ExtensionsPage,
  extensionsQueryKeys,
  fetchExtensionRegistryDocumentFromUrl,
  fetchExtensionsPage,
  importExtensionRegistry,
  InstallProviderDialog,
  parseExtensionRegistryDocument,
  prepareManualProviderInstall,
  RegistryImportDialog,
  setProviderEnabled,
} from '@app/extensions';
import type { AppDrizzleDb } from '@app/db';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';
import { flushLocalDb } from '../lib/local-db.js';

const extensionsSearchSchema = z.object({
  install: z
    .union([z.literal(true), z.literal('1'), z.literal(1)])
    .transform(() => true)
    .catch(false),
});

type ExtensionsSearch = {
  install?: boolean;
};

function errorMessageOf(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

function downloadJson(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function useRegistryImport(db: AppDrizzleDb | null, queryClient: QueryClient) {
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<ExtensionRegistryImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const document = useRef<unknown>(undefined);

  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- ruling: web-mutation-no-cache-write: a registry URL preview writes fetched entries to local dialog state before the user confirms; the import mutation below invalidates the extensions query once it actually persists.
  const loadUrlMutation = useMutation({
    mutationFn: async (value: string) => {
      const result = await fetchExtensionRegistryDocumentFromUrl(value, {
        fetch: globalThis.fetch.bind(globalThis),
      });
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      // The normalized preview is a valid registry document on its own, so a
      // URL import confirms without refetching the URL.
      document.current = {
        name: nextPreview.registry.name,
        registryUrl: nextPreview.registry.registryUrl,
        ...(nextPreview.registry.description !== undefined
          ? { description: nextPreview.registry.description }
          : {}),
        entries: nextPreview.entries,
      };
      setError(null);
    },
    onError: (cause) => {
      setPreview(null);
      document.current = undefined;
      setError(errorMessageOf(cause, 'Could not load the registry.'));
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const result = await importExtensionRegistry({ document: document.current }, { db });
      if (!result.ok) {
        throw result.error;
      }
      // Durability point: an imported registry must survive an immediate reload.
      await flushLocalDb();
      return result.value;
    },
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
    },
    onError: (cause) => {
      setError(errorMessageOf(cause, 'Could not import the registry.'));
    },
  });

  function reset() {
    setOpen(false);
    setJsonText('');
    setUrl('');
    setPreview(null);
    document.current = undefined;
    setError(null);
  }

  return {
    open,
    openDialog() {
      setPreview(null);
      document.current = undefined;
      setError(null);
      setOpen(true);
    },
    reset,
    jsonText,
    setJsonText,
    url,
    setUrl,
    preview,
    error,
    isLoading: loadUrlMutation.isPending || importMutation.isPending,
    previewText() {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        setPreview(null);
        document.current = undefined;
        setError('Registry JSON is not valid JSON.');
        return;
      }
      const result = parseExtensionRegistryDocument(parsed);
      if (!result.ok) {
        setPreview(null);
        document.current = undefined;
        setError(result.error.message);
        return;
      }
      document.current = parsed;
      setPreview(result.value);
      setError(null);
    },
    previewUrl() {
      loadUrlMutation.mutate(url.trim());
    },
    confirm() {
      importMutation.mutate();
    },
  };
}

function useExtensionExport(db: AppDrizzleDb | null) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (db === null) {
        throw new Error('Database is not ready.');
      }
      const result = await exportExtensionRegistryData({ db });
      if (!result.ok) {
        throw result.error;
      }
      return JSON.stringify(result.value, null, 2);
    },
    onSuccess: (json) => {
      setError(null);
      downloadJson(`mangaverse-extensions-${new Date().toISOString().slice(0, 10)}.json`, json);
    },
    onError: (cause) => {
      setError(errorMessageOf(cause, 'Could not export installed extensions.'));
    },
  });

  return {
    isExporting: mutation.isPending,
    error,
    exportExtensions() {
      setError(null);
      mutation.mutate();
    },
  };
}

export const Route = createFileRoute('/extensions')({
  validateSearch: (search: Record<string, unknown>): ExtensionsSearch =>
    extensionsSearchSchema.parse(search),
  component: ExtensionsRoute,
});

function ExtensionsRoute() {
  const navigate = useNavigate({ from: '/extensions' });
  const search = Route.useSearch();
  const isExtensionsIndex = useLocation({
    select: (location) => location.pathname === '/extensions',
  });
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [installOpen, setInstallOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState('');
  const [installSession, setInstallSession] = useState<ExtensionInstallSession | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | undefined>(undefined);
  const registry = useRegistryImport(db, queryClient);
  const exporter = useExtensionExport(db);
  const autoInstallStarted = useRef(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: extensionsQueryKeys.page(),
    queryFn: () => fetchExtensionsPage(db!),
    enabled: dbStatus === 'ready' && db !== null,
  });

  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- ruling: web-mutation-no-cache-write: `prepareManualProviderInstall` fetches a remote manifest and writes it to local component state (`installSession`); it mutates no cached query, and the confirm mutation below already invalidates `extensionsQueryKeys.all` once it writes.
  const fetchManifestMutation = useMutation({
    mutationFn: async (url: string) => {
      const result = await prepareManualProviderInstall(url, {
        fetch: globalThis.fetch.bind(globalThis),
      });
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
      // `confirmProviderInstall` performs the confirm transition itself; pre-transitioning
      // the session to 'installing' made it reject its own input.
      const result = await confirmProviderInstall(db, session);
      if (!result.ok) {
        throw result.error;
      }
      // Durability point: a confirmed install must survive an immediate reload.
      await flushLocalDb();
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
      // Durability point: the user must not be able to navigate away and lose
      // the disable to the coalesced flush window — a lost disable silently
      // resumes remote provider calls.
      await flushLocalDb();
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
    // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change -- ruling: web-route-install-intent: the `?install=1` intent is consumed once when the DB becomes ready, not derived from props on render; the effect below carries the same ruling.
    setInstallError(null);
    // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change -- ruling: web-route-install-intent: opening the dialog is the one-shot side effect of the URL intent, guarded by `autoInstallStarted`.
    setInstallOpen(true);
    if (prefillUrl !== undefined) {
      setManifestUrl(prefillUrl);
    }
  }

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-route-intent: `?install=1` is a navigation intent that must open the dialog once the DB is ready; deriving `installOpen` from the search param would open it before the DB settles and cannot replay the "opened once per visit" guard the ref carries.
  useEffect(() => {
    if (!search.install) {
      autoInstallStarted.current = false;
      return;
    }
    if (dbStatus !== 'ready' || autoInstallStarted.current) {
      return;
    }

    autoInstallStarted.current = true;
    // MangaDex is bundled first-party now; community installs start from a
    // user-provided manifest URL.
    openInstallDialog();
  }, [search.install, dbStatus]);

  return (
    <>
      {isExtensionsIndex ? (
        <ExtensionsPage
          data={data}
          isLoading={dbStatus === 'loading' || isLoading}
          isError={dbStatus === 'error' || isError}
          pendingProviderId={pendingProviderId}
          isExporting={exporter.isExporting}
          exportError={exporter.error}
          onOpenProvider={(providerId) =>
            void navigate({ to: '/extensions/$providerId', params: { providerId } })
          }
          onInstallProvider={() => {
            void navigate({ search: { install: true } });
          }}
          onImportRegistry={() => {
            registry.openDialog();
          }}
          onExportExtensions={() => {
            exporter.exportExtensions();
          }}
          onToggleEnabled={(providerId, enabled) => {
            toggleEnabledMutation.mutate({ providerId, enabled });
          }}
        />
      ) : (
        <Outlet />
      )}

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

      <RegistryImportDialog
        open={registry.open}
        onOpenChange={(open) => {
          if (!open) registry.reset();
        }}
        jsonText={registry.jsonText}
        onJsonTextChange={registry.setJsonText}
        url={registry.url}
        onUrlChange={registry.setUrl}
        preview={registry.preview}
        isLoading={registry.isLoading}
        errorMessage={registry.error}
        onPreviewText={() => {
          registry.previewText();
        }}
        onPreviewUrl={() => {
          registry.previewUrl();
        }}
        onConfirm={() => {
          registry.confirm();
        }}
        onCancel={() => {
          registry.reset();
        }}
      />
    </>
  );
}
