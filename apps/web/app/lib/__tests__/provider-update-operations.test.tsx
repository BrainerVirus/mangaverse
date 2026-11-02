/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANGADEX_MANIFEST } from '@app/extensions/mangadex';
import type { ProviderNetworkRegistration } from '@app/platform';
import {
  ok,
  toExtensionInstallId,
  type ExtensionInstallMetadata,
  type ProviderManifest,
} from '@app/shared';

const mocks = vi.hoisted(() => ({
  checkProviderUpdate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  applyProviderUpdate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listInstalledExtensions: vi.fn<() => Promise<ExtensionInstallMetadata[]>>(),
  replaceProviders:
    vi.fn<
      (providers: readonly ProviderNetworkRegistration[], revision: number) => Promise<unknown>
    >(),
  flushLocalDb: vi.fn<() => Promise<void>>(),
  createUserInitiatedFetch: vi.fn<() => typeof fetch>(),
  userFetch: vi.fn<typeof fetch>(),
}));

vi.mock('@app/extensions', () => ({
  applyProviderUpdate: mocks.applyProviderUpdate,
  checkProviderUpdate: mocks.checkProviderUpdate,
  clearProviderActivity: vi.fn<() => Promise<void>>(),
  extensionsQueryKeys: {
    all: ['extensions'],
    activity: (providerId: string) => ['extensions', 'activity', providerId],
  },
  fetchProviderActivity: vi.fn<() => Promise<unknown[]>>(),
  fetchProviderActivitySummary: vi.fn<() => Promise<unknown>>(),
  loadProviderSettings: vi.fn<() => Promise<unknown>>(),
  runProviderHealthCheck: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@app/db/browser', () => ({
  listInstalledExtensions: mocks.listInstalledExtensions,
}));

vi.mock('../../features/diagnostics/create-app-platform-adapter.js', () => ({
  createAppPlatformAdapter: () => ({
    providerNetwork: { replaceProviders: mocks.replaceProviders },
  }),
}));

vi.mock('../provider-fetch.js', () => ({
  createUserInitiatedFetch: mocks.createUserInitiatedFetch,
}));
vi.mock('../local-db.js', () => ({ flushLocalDb: mocks.flushLocalDb }));
vi.mock('../provider-registry.js', () => ({ getProviderBinding: () => null }));

import { useProviderUpdate } from '../provider-operations.js';

const db = { id: 'fake-db' } as never;

function entry(manifest: ProviderManifest = MANGADEX_MANIFEST): ExtensionInstallMetadata {
  return {
    id: toExtensionInstallId('mangadex'),
    manifest,
    sourceUrl: 'https://mangadex.org',
    installedVersion: manifest.version,
    enabled: true,
    installedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    state: 'installed',
    health: 'ok',
    warnings: [],
  };
}

function wrapper({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProviderUpdate', () => {
  let installed: ExtensionInstallMetadata[];
  let main: Map<string, readonly string[]>;

  beforeEach(() => {
    installed = [entry()];
    main = new Map([['mangadex', MANGADEX_MANIFEST.network?.domains ?? []]]);
    mocks.checkProviderUpdate.mockReset();
    mocks.applyProviderUpdate.mockReset();
    mocks.listInstalledExtensions.mockReset();
    mocks.listInstalledExtensions.mockImplementation(async () => installed);
    mocks.replaceProviders.mockReset();
    mocks.replaceProviders.mockImplementation(async (providers) => {
      main = new Map(providers.map((provider) => [provider.providerId, provider.domains]));
      return ok(undefined);
    });
    mocks.flushLocalDb.mockReset();
    mocks.flushLocalDb.mockResolvedValue(undefined);
    mocks.createUserInitiatedFetch.mockReset();
    mocks.createUserInitiatedFetch.mockReturnValue(mocks.userFetch);
  });

  it('Given an update check, When it runs, Then it fetches through main, not the renderer', async () => {
    mocks.checkProviderUpdate.mockResolvedValue({
      providerId: 'mangadex',
      status: 'up-to-date',
      currentVersion: MANGADEX_MANIFEST.version,
      checkedAt: '2026-01-01T00:00:00Z',
    });
    const { result } = renderHook(() => useProviderUpdate(db, 'mangadex', true), { wrapper });

    await act(async () => {
      result.current.state.onCheck();
    });

    await waitFor(() => expect(mocks.checkProviderUpdate).toHaveBeenCalledTimes(1));
    expect(mocks.createUserInitiatedFetch).toHaveBeenCalledTimes(1);
    expect(mocks.checkProviderUpdate).toHaveBeenCalledWith('mangadex', {
      db,
      fetch: mocks.userFetch,
    });
  });

  it('Given a newer manifest with narrower domains, When applied, Then the allowlist adopts the new set', async () => {
    const remoteManifest = {
      ...MANGADEX_MANIFEST,
      version: '0.2.0',
      network: { domains: ['api.mangadex.org'] },
    };
    mocks.checkProviderUpdate.mockResolvedValue({
      providerId: 'mangadex',
      status: 'available',
      currentVersion: MANGADEX_MANIFEST.version,
      checkedAt: '2026-01-01T00:00:00Z',
      remoteVersion: remoteManifest.version,
      remoteManifest,
    });
    mocks.applyProviderUpdate.mockImplementation(async () => {
      installed = [entry(remoteManifest)];
      return ok(undefined);
    });
    const { result } = renderHook(() => useProviderUpdate(db, 'mangadex', true), { wrapper });

    await act(async () => {
      result.current.state.onCheck();
    });
    await waitFor(() => expect(result.current.state.check?.status).toBe('available'));

    await act(async () => {
      result.current.state.onApply();
    });

    await waitFor(() => expect(mocks.applyProviderUpdate).toHaveBeenCalledTimes(1));
    expect(mocks.applyProviderUpdate).toHaveBeenCalledWith('mangadex', remoteManifest, { db });
    await waitFor(() => expect(mocks.replaceProviders).toHaveBeenCalledTimes(1));
    expect(main.get('mangadex')).toEqual(['api.mangadex.org']);
    expect(mocks.flushLocalDb).toHaveBeenCalledTimes(1);
  });
});
