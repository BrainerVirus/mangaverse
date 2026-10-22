import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toExtensionInstallId, toProviderId } from '@app/shared';
import type { ExtensionInstallMetadata } from '@app/shared';
import type { ProviderAppBinding } from '../../lib/provider-registry.js';

const mocks = vi.hoisted(() => ({
  bindings: [] as unknown[],
  readInstalledExtensions: vi.fn<(db: unknown) => Promise<readonly ExtensionInstallMetadata[]>>(),
}));

vi.mock('../../lib/provider-registry.js', () => ({
  listProviderBindings: () => mocks.bindings as unknown as readonly ProviderAppBinding[],
  readInstalledExtensions: mocks.readInstalledExtensions,
}));

import { listSearchProviders } from '../provider-query-options.js';

const db = {} as Parameters<typeof listSearchProviders>[0];

function installed(
  providerId: string,
  options: { enabled?: boolean; search?: boolean; name?: string } = {},
): ExtensionInstallMetadata {
  return {
    id: toExtensionInstallId(`ext-${providerId}`),
    manifest: {
      id: toProviderId(providerId),
      name: options.name ?? providerId,
      version: '1.0.0',
      source: { url: 'https://example.test/manifest.json' },
      compatibility: { platforms: ['web'] },
      capabilities: { 'discovery.search': options.search ?? true },
      permissions: [],
      languages: ['en'],
      contentFlags: { nsfw: false, suggestive: false, violence: false },
    },
    sourceUrl: 'https://example.test/extension.js',
    installedVersion: '1.0.0',
    enabled: options.enabled ?? true,
    installedAt: '2026-10-20T00:00:00Z',
    state: 'installed',
    health: 'ok',
    warnings: [],
  };
}

describe('listSearchProviders', () => {
  beforeEach(() => {
    mocks.bindings = [{ providerId: 'prov-a' }, { providerId: 'prov-b' }, { providerId: 'prov-c' }];
    mocks.readInstalledExtensions.mockReset();
  });

  it('Given installed providers, Then only enabled ones that declare discovery.search are listed', async () => {
    mocks.readInstalledExtensions.mockResolvedValue([
      installed('prov-a', { name: 'Provider A' }),
      installed('prov-b', { search: false }),
      installed('prov-c', { enabled: false }),
    ]);

    await expect(listSearchProviders(db)).resolves.toEqual([
      { providerId: 'prov-a', label: 'Provider A' },
    ]);
    expect(mocks.readInstalledExtensions).toHaveBeenCalledTimes(1);
    expect(mocks.readInstalledExtensions).toHaveBeenCalledWith(db);
  });

  it('Given no installed provider answers searches, Then the fan-out list is empty', async () => {
    mocks.readInstalledExtensions.mockResolvedValue([installed('prov-b', { search: false })]);

    await expect(listSearchProviders(db)).resolves.toEqual([]);
  });
});
