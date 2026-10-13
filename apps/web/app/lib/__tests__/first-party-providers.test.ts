import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MANGADEX_MANIFEST } from '@app/extensions-mangadex';
import type { ExtensionInstallMetadata } from '@app/shared';
import { toExtensionInstallId } from '@app/shared';

const { listInstalledExtensions, upsertInstalledExtension } = vi.hoisted(() => ({
  listInstalledExtensions: vi.fn(),
  upsertInstalledExtension: vi.fn(async () => ({ ok: true as const, value: undefined })),
}));

vi.mock('@app/db/browser', () => ({
  listInstalledExtensions,
  upsertInstalledExtension,
}));

import { installFirstPartyProviders } from '../first-party-providers.js';

const db = { id: 'fake-db' } as never;

function entry(overrides: Partial<ExtensionInstallMetadata>): ExtensionInstallMetadata {
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

describe('installFirstPartyProviders', () => {
  beforeEach(() => {
    listInstalledExtensions.mockReset();
    upsertInstalledExtension.mockClear();
  });

  it('Given no installed entries, When installing, Then the bundled manifest is registered enabled', async () => {
    listInstalledExtensions.mockResolvedValue([]);
    await installFirstPartyProviders(db);

    expect(upsertInstalledExtension).toHaveBeenCalledTimes(1);
    const metadata = upsertInstalledExtension.mock.calls[0]?.[1] as ExtensionInstallMetadata;
    expect(metadata.enabled).toBe(true);
    expect(metadata.installedVersion).toBe(MANGADEX_MANIFEST.version);
  });

  it('Given the same version already installed, When installing, Then nothing is written', async () => {
    listInstalledExtensions.mockResolvedValue([entry({})]);
    await installFirstPartyProviders(db);
    expect(upsertInstalledExtension).not.toHaveBeenCalled();
  });

  it('Given a disabled entry at an older version, When installing, Then the manifest refreshes without re-enabling', async () => {
    listInstalledExtensions.mockResolvedValue([
      entry({ enabled: false, installedVersion: '0.0.9' }),
    ]);
    await installFirstPartyProviders(db);

    expect(upsertInstalledExtension).toHaveBeenCalledTimes(1);
    const metadata = upsertInstalledExtension.mock.calls[0]?.[1] as ExtensionInstallMetadata;
    expect(metadata.enabled).toBe(false);
    expect(metadata.installedVersion).toBe(MANGADEX_MANIFEST.version);
  });
});
