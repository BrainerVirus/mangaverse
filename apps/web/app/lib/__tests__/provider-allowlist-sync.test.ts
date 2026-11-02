import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANGADEX_MANIFEST } from '@app/extensions/mangadex';
import type { ProviderNetworkRegistration } from '@app/platform';
import {
  createAppError,
  err,
  ok,
  providerAllowsHost,
  toExtensionInstallId,
  type ExtensionInstallMetadata,
} from '@app/shared';

const {
  listInstalledExtensions,
  upsertInstalledExtension,
  replaceProviders,
  revokeProvider,
  onFailure,
} = vi.hoisted(() => ({
  listInstalledExtensions: vi.fn<() => Promise<ExtensionInstallMetadata[]>>(),
  upsertInstalledExtension: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  replaceProviders:
    vi.fn<
      (providers: readonly ProviderNetworkRegistration[], revision: number) => Promise<unknown>
    >(),
  revokeProvider: vi.fn<(providerId: string, revision: number) => Promise<unknown>>(),
  onFailure: vi.fn<(error: unknown, input: { onRetry?: () => void }) => void>(),
}));

vi.mock('@app/db/browser', () => ({
  listInstalledExtensions,
  upsertInstalledExtension,
}));

vi.mock('../../features/diagnostics/create-app-platform-adapter.js', () => ({
  createAppPlatformAdapter: () => ({ providerNetwork: { replaceProviders, revokeProvider } }),
}));

vi.mock('../app-feedback.js', () => ({ feedback: { onFailure } }));

import { installFirstPartyProviders } from '../first-party-providers.js';
import {
  revokeProviderNetworkAccess,
  syncProviderNetworkAllowlist,
  syncProviderNetworkAllowlistReported,
} from '../provider-allowlist-sync.js';

const db = { id: 'fake-db' } as never;

function entry(overrides: Partial<ExtensionInstallMetadata> = {}): ExtensionInstallMetadata {
  return {
    id: toExtensionInstallId('mangadex'),
    manifest: MANGADEX_MANIFEST,
    sourceUrl: 'https://mangadex.org',
    installedVersion: MANGADEX_MANIFEST.version,
    enabled: true,
    installedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    state: 'installed',
    health: 'ok',
    warnings: [],
    ...overrides,
  };
}

let store: ExtensionInstallMetadata[] = [];
let main = new Map<string, readonly string[]>();
let calls: { providers: readonly ProviderNetworkRegistration[]; revision: number }[] = [];

function applySnapshot(providers: readonly ProviderNetworkRegistration[]): void {
  main = new Map(providers.map((provider) => [provider.providerId, provider.domains]));
}

describe('provider allowlist sync', () => {
  beforeEach(() => {
    store = [];
    main = new Map();
    calls = [];
    listInstalledExtensions.mockReset();
    listInstalledExtensions.mockImplementation(async () => store);
    upsertInstalledExtension.mockReset();
    upsertInstalledExtension.mockImplementation(
      async (_db: unknown, metadata: ExtensionInstallMetadata) => {
        store = [
          ...store.filter((current) => String(current.id) !== String(metadata.id)),
          metadata,
        ];
        return ok(undefined);
      },
    );
    replaceProviders.mockReset();
    replaceProviders.mockImplementation(async (providers, revision) => {
      calls.push({ providers, revision });
      applySnapshot(providers);
      return ok(undefined);
    });
    revokeProvider.mockReset();
    revokeProvider.mockImplementation(async (providerId) => {
      main.delete(providerId);
      return ok(undefined);
    });
    onFailure.mockReset();
  });

  it('Given a stale entry main remembers, When syncing after a reload, Then the full snapshot removes it', async () => {
    main = new Map([['stale', ['api.stale.example']]]);
    store = [entry()];

    await syncProviderNetworkAllowlist(db);

    expect(main.has('stale')).toBe(false);
    expect(main.get('mangadex')).toEqual([
      'api.mangadex.org',
      'uploads.mangadex.org',
      '*.mangadex.network',
    ]);
    expect(calls.at(-1)?.providers).toEqual([
      {
        providerId: 'mangadex',
        domains: ['api.mangadex.org', 'uploads.mangadex.org', '*.mangadex.network'],
      },
    ]);
  });

  it('Given a failed sync, When the next sync runs, Then the failure rejects and the retry sends the same snapshot', async () => {
    store = [entry()];
    replaceProviders.mockResolvedValueOnce(
      err(createAppError({ code: 'platform.unexpected', message: 'main is unavailable' })),
    );

    await expect(syncProviderNetworkAllowlist(db)).rejects.toThrow('main is unavailable');
    expect(main.size).toBe(0);

    await syncProviderNetworkAllowlist(db);
    expect(main.get('mangadex')).toBeDefined();
    expect(replaceProviders).toHaveBeenCalledTimes(2);
  });

  it('Given overlapping syncs, When an older one is still in flight, Then only the newest snapshot lands last', async () => {
    store = [entry()];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    replaceProviders.mockImplementationOnce(async (providers, revision) => {
      calls.push({ providers, revision });
      firstStarted();
      await firstGate;
      applySnapshot(providers);
      return ok(undefined);
    });

    const first = syncProviderNetworkAllowlist(db);
    await started;

    // The provider is disabled while the first (now stale) sync is still in flight.
    store = [];
    const second = syncProviderNetworkAllowlist(db);
    await Promise.resolve();

    expect(replaceProviders).toHaveBeenCalledTimes(1);
    releaseFirst();
    await Promise.all([first, second]);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.providers).toEqual([]);
    expect(calls[1]?.revision).toBeGreaterThan(calls[0]?.revision ?? 0);
    expect(main.size).toBe(0);
  });

  it('Given a bundled manifest at the same version without domains, When the app starts, Then the stored manifest and allowlist gain them', async () => {
    const oldManifest = { ...MANGADEX_MANIFEST, version: '0.1.0', network: undefined };
    store = [entry({ manifest: oldManifest, installedVersion: '0.1.0' })];

    await installFirstPartyProviders(db);
    await syncProviderNetworkAllowlist(db);

    const stored = store.find((current) => String(current.id) === String(MANGADEX_MANIFEST.id));
    expect(stored).toBeDefined();
    expect(stored?.installedVersion).toBe(MANGADEX_MANIFEST.version);
    expect(stored?.manifest.network?.domains).toEqual(MANGADEX_MANIFEST.network?.domains);
    expect(providerAllowsHost(stored!.manifest, 'api.mangadex.org')).toBe(true);
    expect(providerAllowsHost(stored!.manifest, 'cmdxd98sb0x3yprd.mangadex.network')).toBe(true);
    expect(main.get('mangadex')).toEqual(MANGADEX_MANIFEST.network?.domains);
  });

  it('Given an allowed provider, When the revoke fails, Then the disable does not commit and the failure is visible', async () => {
    main = new Map([['mangadex', ['api.mangadex.org']]]);
    store = [entry()];
    const failure = err(
      createAppError({ code: 'platform.unexpected', message: 'main is unavailable' }),
    );
    revokeProvider.mockResolvedValueOnce(failure);
    const disable = vi.fn<() => Promise<void>>(async () => {
      store = [entry({ enabled: false })];
    });

    await expect(revokeProviderNetworkAccess('mangadex', disable)).rejects.toThrow(
      'main is unavailable',
    );
    // Nothing claims the provider is off while main may still let it through.
    expect(disable).not.toHaveBeenCalled();
    expect(store[0]?.enabled).toBe(true);

    await revokeProviderNetworkAccess('mangadex', disable);

    expect(main.has('mangadex')).toBe(false);
    expect(disable).toHaveBeenCalledOnce();
    expect(store[0]?.enabled).toBe(false);
  });

  it('Given a snapshot read before a disable, When it lands after the revoke, Then main fences it out', async () => {
    store = [entry()];
    const seen: number[] = [];
    replaceProviders.mockImplementation(async (providers, revision) => {
      seen.push(revision);
      calls.push({ providers, revision });
      applySnapshot(providers);
      return ok(undefined);
    });
    revokeProvider.mockImplementation(async (providerId, revision) => {
      seen.push(revision);
      main.delete(providerId);
      return ok(undefined);
    });

    const sync = syncProviderNetworkAllowlist(db);
    const revoke = revokeProviderNetworkAccess('mangadex', async () => {
      store = [entry({ enabled: false })];
    });
    await Promise.all([sync, revoke]);

    expect(seen[1]).toBeGreaterThan(seen[0] ?? Number.POSITIVE_INFINITY);
    expect(main.has('mangadex')).toBe(false);

    await syncProviderNetworkAllowlist(db);
    expect(main.has('mangadex')).toBe(false);
  });

  it('Given a failed sync after an install, When reported, Then the user sees it with a retry that succeeds', async () => {
    store = [entry()];
    replaceProviders.mockResolvedValueOnce(
      err(createAppError({ code: 'platform.unexpected', message: 'main is unavailable' })),
    );

    await syncProviderNetworkAllowlistReported(db);

    expect(main.size).toBe(0);
    expect(onFailure).toHaveBeenCalledOnce();
    const retry = onFailure.mock.calls[0]?.[1].onRetry;
    expect(retry).toBeTypeOf('function');

    retry?.();
    await syncProviderNetworkAllowlist(db);
    expect(main.get('mangadex')).toBeDefined();
  });
});
