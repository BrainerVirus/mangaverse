import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AppDrizzleDb } from '@app/db/browser';
import type { ProviderContract } from '@app/extensions-sdk';
import type { ExtensionInstallMetadata, MangaIdentity } from '@app/shared';
import type { ProviderAppBinding } from '../../lib/provider-registry.js';
// Static import: evaluating the provider query graph costs seconds under CPU
// contention, and Vitest charges that to the test's 5s timeout when it is awaited
// inside the test body. Collection has no per-test timeout.
import { fetchDiscoverProviders } from '../provider-discover.js';

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
    readInstalledExtensions: vi.fn<(db: unknown) => Promise<readonly ExtensionInstallMetadata[]>>(),
    resolveInstalledProviderFrom:
      vi.fn<
        (
          installed: readonly ExtensionInstallMetadata[],
          providerId: string,
        ) => ProviderContract | null
      >(),
  };
});

vi.mock('../../lib/provider-registry.js', () => ({
  listProviderBindings: () => mocks.bindings as unknown as readonly ProviderAppBinding[],
  readInstalledExtensions: mocks.readInstalledExtensions,
  resolveInstalledProviderFrom: mocks.resolveInstalledProviderFrom,
}));

const db = {} as AppDrizzleDb;
const installed = [] as readonly ExtensionInstallMetadata[];

function installedProvider(name = 'Fake'): ProviderContract {
  return {
    manifest: {
      id: 'fake',
      name,
      capabilities: { 'discovery.latest': true, 'discovery.popular': true },
    },
    browseLatest: async () => ({ items: [{ id: 'latest-1' }], hasMore: false }),
    browsePopular: async () => ({ items: [{ id: 'popular-1' }], hasMore: false }),
  } as unknown as ProviderContract;
}

describe('fetchDiscoverProviders', () => {
  beforeEach(() => {
    mocks.bindings = [mocks.binding];
    mocks.readInstalledExtensions.mockReset().mockResolvedValue(installed);
    mocks.resolveInstalledProviderFrom
      .mockReset()
      .mockImplementation((_installed, providerId) =>
        providerId === 'fake' ? installedProvider() : null,
      );
  });

  it('reads the install table once and resolves every binding once', async () => {
    mocks.bindings = [{ ...mocks.binding, providerId: 'broken' }, mocks.binding];

    const descriptors = await fetchDiscoverProviders(db);

    expect(mocks.readInstalledExtensions).toHaveBeenCalledTimes(1);
    expect(mocks.readInstalledExtensions).toHaveBeenCalledWith(db);
    expect(mocks.resolveInstalledProviderFrom).toHaveBeenCalledTimes(2);
    expect(mocks.resolveInstalledProviderFrom).toHaveBeenCalledWith(installed, 'broken');
    expect(mocks.resolveInstalledProviderFrom).toHaveBeenCalledWith(installed, 'fake');
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]?.sections.map((section) => section.id)).toEqual(['latest', 'popular']);
  });

  it('drops the provider when it is not installed', async () => {
    mocks.resolveInstalledProviderFrom.mockReturnValue(null);

    await expect(fetchDiscoverProviders(db)).resolves.toEqual([]);
  });

  it('keeps healthy providers when another provider throws while resolving', async () => {
    mocks.bindings = [{ ...mocks.binding, providerId: 'broken' }, mocks.binding];
    mocks.resolveInstalledProviderFrom.mockImplementation((_installed, providerId) => {
      if (providerId === 'broken') throw new Error('createProvider failed');
      return installedProvider();
    });

    const descriptors = await fetchDiscoverProviders(db);

    expect(descriptors.map((provider) => provider.providerId)).toEqual(['fake']);
    expect(descriptors[0]?.sections.map((section) => section.id)).toEqual(['latest', 'popular']);
  });

  it('drops only the provider whose manifest is malformed', async () => {
    mocks.bindings = [{ ...mocks.binding, providerId: 'broken' }, mocks.binding];
    const malformed = {
      manifest: {
        id: 'broken',
        name: 'Broken',
        capabilities: { 'discovery.latest': true },
      },
      browseLatest: async () => ({ items: [], hasMore: false }),
    } as unknown as ProviderContract;
    Object.defineProperty(malformed.manifest, 'capabilities', {
      get() {
        throw new Error('malformed manifest');
      },
    });
    mocks.resolveInstalledProviderFrom.mockImplementation((_installed, providerId) =>
      providerId === 'broken' ? malformed : installedProvider(),
    );

    const descriptors = await fetchDiscoverProviders(db);

    expect(descriptors.map((provider) => provider.providerId)).toEqual(['fake']);
    expect(descriptors[0]?.providerName).toBe('Fake');
  });

  it('surfaces an install read failure instead of an empty feed', async () => {
    mocks.readInstalledExtensions.mockRejectedValue(new Error('db offline'));

    await expect(fetchDiscoverProviders(db)).rejects.toThrow('db offline');
    expect(mocks.resolveInstalledProviderFrom).not.toHaveBeenCalled();
  });

  it('Given a capability is not declared, Then that section is not offered', async () => {
    mocks.resolveInstalledProviderFrom.mockReturnValue({
      ...installedProvider(),
      manifest: {
        id: 'fake',
        name: 'Fake',
        capabilities: { 'discovery.latest': true, 'discovery.popular': false },
      },
    } as unknown as ProviderContract);

    const descriptors = await fetchDiscoverProviders(db);

    expect(descriptors[0]?.sections.map((section) => section.id)).toEqual(['latest']);
  });
});
