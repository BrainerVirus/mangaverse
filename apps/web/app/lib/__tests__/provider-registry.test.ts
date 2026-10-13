import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MANGADEX_MANIFEST } from '@app/extensions-mangadex';
import type { ExtensionInstallMetadata } from '@app/shared';
import { toExtensionInstallId } from '@app/shared';

const { listInstalledExtensions } = vi.hoisted(() => ({
  listInstalledExtensions: vi.fn(),
}));

vi.mock('@app/db/browser', () => ({
  listInstalledExtensions,
}));

import { resolveInstalledProvider } from '../provider-registry.js';

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

describe('resolveInstalledProvider', () => {
  beforeEach(() => {
    listInstalledExtensions.mockReset();
  });

  it('Given an enabled MangaDex entry, When resolving, Then the provider contract is returned', async () => {
    listInstalledExtensions.mockResolvedValue([entry(true)]);
    const provider = await resolveInstalledProvider(db, 'mangadex');
    expect(provider).not.toBeNull();
    expect(String(provider?.manifest.id)).toBe('mangadex');
    expect(typeof provider?.search).toBe('function');
  });

  it('Given a disabled MangaDex entry, When resolving, Then null is returned', async () => {
    listInstalledExtensions.mockResolvedValue([entry(false)]);
    expect(await resolveInstalledProvider(db, 'mangadex')).toBeNull();
  });

  it('Given an unknown provider id, When resolving, Then null is returned', async () => {
    listInstalledExtensions.mockResolvedValue([entry(true)]);
    expect(await resolveInstalledProvider(db, 'not-installed')).toBeNull();
  });
});
