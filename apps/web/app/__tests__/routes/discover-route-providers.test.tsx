/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProviderContract } from '@app/extensions-sdk';
import type * as SettingsModule from '@app/settings';
import type { ExtensionInstallMetadata } from '@app/shared';
import type { ProviderAppBinding } from '../../lib/provider-registry.js';

const mocks = vi.hoisted(() => ({
  binding: {
    providerId: 'healthy',
    sections: [
      { id: 'latest', title: 'Latest', capability: 'discovery.latest', browse: 'browseLatest' },
    ],
    toSearchIdentities: (items: readonly unknown[]) => items,
  },
  bindings: [] as unknown[],
  readInstalledExtensions: vi.fn<(db: unknown) => Promise<readonly ExtensionInstallMetadata[]>>(),
  resolveInstalledProviderFrom:
    vi.fn<
      (
        installed: readonly ExtensionInstallMetadata[],
        providerId: string,
      ) => ProviderContract | null
    >(),
  fetchAppSettings: vi.fn<(db: unknown) => Promise<{ settings: { explicitContent: boolean } }>>(),
  navigate: vi.fn<(options: unknown) => void>(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@app/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return { ...actual, fetchAppSettings: mocks.fetchAppSettings };
});

vi.mock('../../lib/provider-registry.js', () => ({
  getProviderBinding: () => null,
  listProviderBindings: () => mocks.bindings as unknown as readonly ProviderAppBinding[],
  readInstalledExtensions: mocks.readInstalledExtensions,
  resolveInstalledProviderFrom: mocks.resolveInstalledProviderFrom,
}));

const db = {};

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => db,
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => vi.fn<() => void>(),
}));

import { Route } from '../../routes/discover.js';

const DiscoverRoute = Route.options.component;

if (DiscoverRoute === undefined) {
  throw new Error('The /discover route must expose its component.');
}

function healthyProvider(): ProviderContract {
  const manga = {
    id: 'latest-1',
    canonicalTitle: 'Latest One',
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [],
    defaultProviderMappingId: 'map-1',
    merged: false,
  };
  return {
    manifest: { id: 'healthy', name: 'Healthy', capabilities: { 'discovery.latest': true } },
    browseLatest: async () => ({ items: [manga], hasMore: false }),
  } as unknown as ProviderContract;
}

describe('/discover route provider feed', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bindings = [mocks.binding];
    mocks.readInstalledExtensions.mockResolvedValue([]);
    mocks.resolveInstalledProviderFrom.mockReturnValue(healthyProvider());
    mocks.fetchAppSettings.mockResolvedValue({ settings: { explicitContent: false } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <DiscoverRoute />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('Given one throwing provider, When discover loads, Then the healthy sections render without an error', async () => {
    mocks.bindings = [{ ...mocks.binding, providerId: 'broken' }, mocks.binding];
    mocks.resolveInstalledProviderFrom.mockImplementation((_installed, providerId) => {
      if (providerId === 'broken') throw new Error('createProvider failed');
      return healthyProvider();
    });

    await vi.waitFor(() => expect(container.textContent).toContain('Latest'));

    expect(mocks.readInstalledExtensions).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Healthy');
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(container.textContent).not.toContain('Could not load discover feed');
    expect(container.textContent).not.toContain('Browse providers');
  });

  it('Given the install read fails, When discover loads, Then the route error state renders', async () => {
    mocks.readInstalledExtensions.mockRejectedValue(new Error('db offline'));

    await vi.waitFor(() => expect(container.textContent).toContain('Could not load discover feed'));

    expect(mocks.readInstalledExtensions).toHaveBeenCalledTimes(1);
    expect(mocks.resolveInstalledProviderFrom).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Browse providers');
  });
});
