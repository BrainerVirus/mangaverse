import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANGADEX_MANIFEST } from '@app/extensions/mangadex';
import type { ExtensionInstallMetadata } from '@app/shared';
import { toExtensionInstallId, toProviderId, type ProviderSettingsValues } from '@app/shared';

const { listInstalledExtensions, loadProviderSettings } = vi.hoisted(() => ({
  listInstalledExtensions: vi.fn<(...args: unknown[]) => unknown>(),
  loadProviderSettings: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('@app/db/browser', () => ({ listInstalledExtensions }));
vi.mock('@app/extensions', () => ({ loadProviderSettings }));

import { createLibraryUpdateProviderResolver } from '../library-update-provider.js';

const db = { id: 'fake-db' } as never;

function entry(enabled: boolean): ExtensionInstallMetadata {
  return {
    id: toExtensionInstallId('mangadex'),
    manifest: MANGADEX_MANIFEST,
    sourceUrl: 'https://mangadex.org',
    installedVersion: MANGADEX_MANIFEST.version,
    enabled,
    installedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    state: 'installed',
    health: 'ok',
    warnings: [],
  };
}

describe('createLibraryUpdateProviderResolver', () => {
  beforeEach(() => {
    listInstalledExtensions.mockReset();
    loadProviderSettings.mockReset();
    loadProviderSettings.mockResolvedValue({} satisfies ProviderSettingsValues);
  });

  it('Given an enabled provider, Then chapter lists are available with a rate-limit interval', async () => {
    listInstalledExtensions.mockResolvedValue([entry(true)]);
    const resolver = createLibraryUpdateProviderResolver(db);
    const resolution = await resolver(toProviderId('mangadex'));

    expect(resolution.status).toBe('available');
    if (resolution.status !== 'available') return;
    // MangaDex declares 40 requests/minute for its official API.
    expect(resolution.provider.requestIntervalMs).toBe(1500);
  });

  it('Given a disabled provider, Then it is reported unavailable and never called', async () => {
    listInstalledExtensions.mockResolvedValue([entry(false)]);
    const resolver = createLibraryUpdateProviderResolver(db);
    await expect(resolver(toProviderId('mangadex'))).resolves.toEqual({
      status: 'unavailable',
      reason: 'Provider is disabled.',
    });
  });

  it('Given a provider that is not installed, Then it is reported unavailable', async () => {
    listInstalledExtensions.mockResolvedValue([]);
    const resolver = createLibraryUpdateProviderResolver(db);
    await expect(resolver(toProviderId('missing'))).resolves.toEqual({
      status: 'unavailable',
      reason: 'Provider is not installed.',
    });
  });

  it('Given a zero rate limit, Then the provider is skipped with a reason', async () => {
    listInstalledExtensions.mockResolvedValue([entry(true)]);
    loadProviderSettings.mockResolvedValue({ rateLimitOverrideRpm: 0 });
    const resolver = createLibraryUpdateProviderResolver(db);
    await expect(resolver(toProviderId('mangadex'))).resolves.toEqual({
      status: 'unavailable',
      reason: 'Provider rate limit is set to zero.',
    });
  });
});
