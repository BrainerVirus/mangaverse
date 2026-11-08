/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProviderContract } from '@app/extensions-sdk';
import type * as SettingsModule from '@/features/settings';
import type { ExtensionInstallMetadata } from '@app/shared';
import type { ProviderAppBinding } from '../../lib/provider-registry.js';

const mocks = vi.hoisted(() => ({
  binding: {
    providerId: 'healthy',
    sections: [
      { id: 'latest', title: 'Latest', capability: 'discovery.latest', browse: 'browseLatest' },
      { id: 'popular', title: 'Popular', capability: 'discovery.popular', browse: 'browsePopular' },
    ],
    toSearchIdentities: (items: readonly unknown[]) => items,
  },
  search: {} as Record<string, unknown>,
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
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => mocks.search }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { canGoBack: () => false } }),
}));

vi.mock('@/features/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return { ...actual, fetchAppSettings: mocks.fetchAppSettings };
});

vi.mock('../../lib/provider-registry.js', () => ({
  getProviderBinding: () => (mocks.search.section === undefined ? null : mocks.binding),
  listProviderBindings: () => mocks.bindings as unknown as readonly ProviderAppBinding[],
  readInstalledExtensions: mocks.readInstalledExtensions,
  resolveInstalledProviderFrom: mocks.resolveInstalledProviderFrom,
  resolveInstalledProvider: (_db: unknown, providerId: string) =>
    Promise.resolve(mocks.resolveInstalledProviderFrom([], providerId)),
}));

const db = {};

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => db,
  useLocalDbStatus: () => 'ready',
  useLocalDbError: () => null,
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
    manifest: {
      id: 'healthy',
      name: 'Healthy',
      capabilities: { 'discovery.latest': true, 'discovery.popular': true },
    },
    browseLatest: async () => ({ items: [manga], hasMore: false }),
    browsePopular: async () => ({ items: [manga], hasMore: false }),
  } as unknown as ProviderContract;
}

describe('/discover route provider feed', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bindings = [mocks.binding];
    mocks.readInstalledExtensions.mockResolvedValue([]);
    mocks.search = {};
    mocks.resolveInstalledProviderFrom.mockReturnValue(healthyProvider());
    mocks.fetchAppSettings.mockResolvedValue({ settings: { explicitContent: false } });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function renderRoute(): void {
    act(() => {
      root.render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <DiscoverRoute />
        </QueryClientProvider>,
      );
    });
  }

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
    renderRoute();

    await vi.waitFor(() => expect(container.textContent).toContain('Latest'));

    expect(mocks.readInstalledExtensions).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Healthy');
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(container.textContent).not.toContain('Could not load discover feed');
    expect(container.textContent).not.toContain('Browse providers');
  });

  it('Given one section preview fails, When discover loads, Then its row retries while the healthy section shows', async () => {
    const provider = healthyProvider();
    let popularCalls = 0;
    provider.browsePopular = async () => {
      popularCalls += 1;
      if (popularCalls === 1) throw new Error('HTTP 503.');
      return { items: [], hasMore: false };
    };
    mocks.resolveInstalledProviderFrom.mockReturnValue(provider);
    renderRoute();

    await vi.waitFor(() => expect(container.textContent).toContain('Popular couldn’t load'));
    expect(container.textContent).toContain('Latest One');
    const popularError = container.querySelector('[data-testid="discover-section-popular-error"]');
    expect(popularError).not.toBeNull();
    const retry = popularError?.querySelector('button');
    expect(retry?.textContent).toContain('Retry');

    await act(async () => {
      retry?.click();
    });
    await vi.waitFor(() => expect(popularCalls).toBe(2));
    await vi.waitFor(() => expect(container.textContent).not.toContain('Popular couldn’t load'));
  });

  it('Given app settings fail, When discover loads, Then safe content still renders with a settings retry', async () => {
    mocks.fetchAppSettings.mockRejectedValue(new Error('settings unavailable'));
    renderRoute();

    await vi.waitFor(() => expect(container.textContent).toContain('Latest One'));
    expect(container.textContent).toContain('Settings could not be read');
    expect(container.textContent).toContain('Retry');
    expect(container.textContent).not.toContain('Browse providers');
  });

  it('Given a deep link to a failing section, When it loads, Then loaded content keeps its Back button', async () => {
    mocks.search = { provider: 'healthy', section: 'popular' };
    const provider = healthyProvider();
    provider.browsePopular = async () => {
      throw new Error('HTTP 503.');
    };
    mocks.resolveInstalledProviderFrom.mockReturnValue(provider);
    renderRoute();

    await vi.waitFor(() => expect(container.textContent).toContain('Popular couldn’t load'));
    expect(container.textContent).toContain('Back to discover');
    expect(container.textContent).not.toContain('Could not load discover feed');
  });

  it('Given the install read fails, When discover loads, Then the route error state renders', async () => {
    mocks.readInstalledExtensions.mockRejectedValue(new Error('db offline'));
    renderRoute();

    await vi.waitFor(() => expect(container.textContent).toContain('Could not load discover feed'));

    expect(mocks.readInstalledExtensions).toHaveBeenCalledTimes(1);
    expect(mocks.resolveInstalledProviderFrom).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Browse providers');
  });
});
