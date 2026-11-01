import type { AppDrizzleDb } from '@app/db';
import {
  applyProviderUpdate,
  checkProviderUpdate,
  clearProviderActivity,
  extensionsQueryKeys,
  fetchProviderActivity,
  fetchProviderActivitySummary,
  loadProviderSettings,
  runProviderHealthCheck,
  type ActivityLevelFilter,
  type ProviderActivityState,
  type ProviderHealthCheckReport,
  type ProviderHealthState,
  type ProviderUpdateCheck,
  type ProviderUpdateState,
} from '@app/extensions';
import type { ProviderManifest } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { actionFailureMessage } from './app-feedback.js';
import { getProviderBinding } from './provider-registry.js';
import { flushLocalDb } from './local-db.js';

export interface ProviderActivityOperations {
  readonly state: ProviderActivityState;
  readonly lastHealthCheckAt: string | null;
}

export function useProviderActivity(
  db: AppDrizzleDb | null,
  providerId: string,
  enabled: boolean,
): ProviderActivityOperations {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<ActivityLevelFilter>('all');
  const query = useQuery({
    queryKey: extensionsQueryKeys.activity(providerId, level),
    queryFn: () => fetchProviderActivity(db!, providerId, level === 'all' ? undefined : level),
    enabled: enabled && db !== null,
  });
  const summary = useQuery({
    queryKey: extensionsQueryKeys.activity(providerId, 'summary'),
    queryFn: () => fetchProviderActivitySummary(db!, providerId),
    enabled: enabled && db !== null,
  });
  const clear = useMutation({
    mutationFn: async () => {
      if (db === null) throw new Error('Database is not ready.');
      await clearProviderActivity(db, providerId);
      await flushLocalDb();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: extensionsQueryKeys.activity(providerId),
      });
    },
  });

  const logs = query.data ?? [];
  return {
    state: {
      logs,
      counts: summary.data?.counts ?? { total: 0, info: 0, errors: 0, warnings: 0 },
      isLoading: query.isLoading || summary.isLoading,
      error: query.isError
        ? actionFailureMessage(query.error, 'Provider operation failed.')
        : summary.isError
          ? actionFailureMessage(summary.error, 'Provider operation failed.')
          : null,
      level,
      onLevelChange: setLevel,
      onClear: () => clear.mutate(),
      isClearing: clear.isPending,
    },
    lastHealthCheckAt: summary.data?.lastHealthCheckAt ?? null,
  };
}

async function probeHealth(
  db: AppDrizzleDb,
  providerId: string,
  manifest: ProviderManifest | undefined,
  controller: AbortController,
  includeNetwork: boolean,
): Promise<ProviderHealthCheckReport> {
  const binding = getProviderBinding(providerId);
  const provider = binding?.createProvider();
  const search = provider?.search?.bind(provider);
  const networkProbe =
    search !== undefined && manifest !== undefined
      ? async (signal: AbortSignal) => {
          const settings = await loadProviderSettings(db, providerId);
          await search(
            { manifest, providerId, settings, signal },
            { query: manifest.name, limit: 1 },
          );
        }
      : undefined;

  const report = await runProviderHealthCheck(providerId, {
    db,
    runtimeAvailable: (id) => getProviderBinding(id) !== null,
    includeNetwork: includeNetwork && networkProbe !== undefined,
    ...(networkProbe !== undefined ? { networkProbe } : {}),
    signal: controller.signal,
  });
  await flushLocalDb();
  return report;
}

export interface ProviderHealthOperations {
  readonly state: ProviderHealthState;
}

export function useProviderHealth(
  db: AppDrizzleDb | null,
  providerId: string,
  options: {
    readonly enabled: boolean;
    readonly manifest: ProviderManifest | undefined;
    readonly canRunNetworkCheck: boolean;
    readonly lastCheckedAt: string | null;
  },
): ProviderHealthOperations {
  const queryClient = useQueryClient();
  const [includeNetwork, setIncludeNetwork] = useState(false);
  const [report, setReport] = useState<ProviderHealthCheckReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const check = useMutation({
    mutationFn: async (network: boolean) => {
      if (db === null) throw new Error('Database is not ready.');
      const controller = new AbortController();
      controllerRef.current = controller;
      return probeHealth(db, providerId, options.manifest, controller, network);
    },
    onSuccess: (next) => {
      setReport(next);
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: extensionsQueryKeys.activity(providerId),
      });
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
    },
    onError: (cause) => {
      setError(actionFailureMessage(cause, 'Provider operation failed.'));
    },
  });

  return {
    state: {
      report,
      isChecking: check.isPending,
      error,
      canRunNetworkCheck: options.enabled && options.canRunNetworkCheck,
      includeNetwork,
      onIncludeNetworkChange: setIncludeNetwork,
      onRun: () => check.mutate(includeNetwork),
      onCancel: () => controllerRef.current?.abort(),
      lastCheckedAt: options.lastCheckedAt,
    },
  };
}

export interface ProviderUpdateOperations {
  readonly state: ProviderUpdateState;
}

export function useProviderUpdate(
  db: AppDrizzleDb | null,
  providerId: string,
  enabled: boolean,
): ProviderUpdateOperations {
  const queryClient = useQueryClient();
  const [checkResult, setCheckResult] = useState<ProviderUpdateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: async () => {
      if (db === null) throw new Error('Database is not ready.');
      return checkProviderUpdate(providerId, { db, fetch: (input, init) => fetch(input, init) });
    },
    onSuccess: (result) => {
      setCheckResult(result);
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: extensionsQueryKeys.activity(providerId),
      });
    },
    onError: (cause) => {
      setError(actionFailureMessage(cause, 'Provider operation failed.'));
    },
  });

  const apply = useMutation({
    mutationFn: async (manifest: NonNullable<ProviderUpdateCheck['remoteManifest']>) => {
      if (db === null) throw new Error('Database is not ready.');
      const result = await applyProviderUpdate(providerId, manifest, { db });
      if (!result.ok) throw result.error;
      await flushLocalDb();
    },
    onSuccess: () => {
      setCheckResult(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
      void queryClient.invalidateQueries({
        queryKey: extensionsQueryKeys.activity(providerId),
      });
    },
    onError: (cause) => {
      setError(actionFailureMessage(cause, 'Provider operation failed.'));
    },
  });

  return {
    state: {
      check: checkResult,
      isChecking: enabled && check.isPending,
      error,
      onCheck: () => check.mutate(),
      onApply: () => {
        if (checkResult?.remoteManifest !== undefined) {
          apply.mutate(checkResult.remoteManifest);
        }
      },
      isApplying: apply.isPending,
    },
  };
}
