import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AppDrizzleDb } from '@app/db/browser';
import type { ProviderContract } from '@app/extensions-sdk';
import type { MangaIdentity } from '@app/shared';
import type { ProviderAppBinding } from '../../lib/provider-registry.js';

const mocks = vi.hoisted(() => {
  const binding = {
    providerId: 'fake',
    sections: [
      { id: 'latest', title: 'Latest', capability: 'discovery.latest', browse: 'browseLatest' },
      { id: 'popular', title: 'Popular', capability: 'discovery.popular', browse: 'browsePopular' },
    ],
    toSearchIdentities: (items: readonly unknown[]) => items as readonly MangaIdentity[],
  };
  return {
    binding,
    bindings: [binding],
    resolveInstalledProvider:
      vi.fn<(db: unknown, providerId: string) => Promise<ProviderContract | null>>(),
  };
});

vi.mock('../../lib/provider-registry.js', () => ({
  listProviderBindings: () => mocks.bindings as unknown as readonly ProviderAppBinding[],
  resolveInstalledProvider: mocks.resolveInstalledProvider,
}));

const db = {} as AppDrizzleDb;

function installedProvider(): ProviderContract {
  return {
    manifest: {
      id: 'fake',
      name: 'Fake',
      capabilities: { 'discovery.latest': true, 'discovery.popular': true },
    },
    browseLatest: async () => ({ items: [{ id: 'latest-1' }], hasMore: false }),
    browsePopular: async () => ({ items: [{ id: 'popular-1' }], hasMore: false }),
  } as unknown as ProviderContract;
}

describe('fetchProviderDiscoverData', () => {
  beforeEach(() => {
    mocks.bindings = [mocks.binding];
    mocks.resolveInstalledProvider.mockReset().mockResolvedValue(installedProvider());
  });

  it('resolves the installed provider once for every section it previews', async () => {
    const { fetchProviderDiscoverData } = await import('../provider-discover.js');

    const data = await fetchProviderDiscoverData(db);

    expect(mocks.resolveInstalledProvider).toHaveBeenCalledTimes(1);
    expect(mocks.resolveInstalledProvider).toHaveBeenCalledWith(db, 'fake');
    expect(data.providers).toHaveLength(1);
    expect(data.providers[0]?.sections.map((section) => section.id)).toEqual(['latest', 'popular']);
  });

  it('drops the provider when it is not installed', async () => {
    mocks.resolveInstalledProvider.mockResolvedValue(null);
    const { fetchProviderDiscoverData } = await import('../provider-discover.js');

    await expect(fetchProviderDiscoverData(db)).resolves.toEqual({ providers: [] });
  });

  it('keeps healthy providers when another provider throws while resolving', async () => {
    mocks.bindings = [{ ...mocks.binding, providerId: 'broken' }, mocks.binding];
    mocks.resolveInstalledProvider.mockImplementation(async (_db, providerId) => {
      if (providerId === 'broken') throw new Error('createProvider failed');
      return installedProvider();
    });
    const { fetchProviderDiscoverData } = await import('../provider-discover.js');

    const data = await fetchProviderDiscoverData(db);

    expect(data.providers.map((provider) => provider.providerId)).toEqual(['fake']);
    expect(data.providers[0]?.sections.map((section) => section.id)).toEqual(['latest', 'popular']);
  });
});
