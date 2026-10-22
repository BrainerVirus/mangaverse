import { describe, expect, it, vi } from 'vitest';
import type { AppDrizzleDb } from '@app/db';
import type { ExtensionInstallMetadata } from '@app/shared';

const mocks = vi.hoisted(() => ({
  listInstalledExtensions: vi.fn<(db: unknown) => Promise<readonly ExtensionInstallMetadata[]>>(),
}));

vi.mock('@app/db', () => ({
  listInstalledExtensions: mocks.listInstalledExtensions,
}));

import { fetchProviderUiInfo } from './fetch-provider-ui-info.js';

function installed(
  id: string,
  name: string,
  enabled: boolean,
  capabilities: Record<string, boolean>,
): ExtensionInstallMetadata {
  return {
    id,
    manifest: { id, name, capabilities },
    sourceUrl: 'https://example.com/manifest.json',
    installedVersion: '1.0.0',
    enabled,
    installedAt: '2026-01-01T00:00:00Z',
    state: 'installed',
    health: 'ok',
    warnings: [],
  } as unknown as ExtensionInstallMetadata;
}

describe('fetchProviderUiInfo', () => {
  it('returns sorted display names and declared capabilities', async () => {
    mocks.listInstalledExtensions.mockResolvedValue([
      installed('z', 'Zeta', true, { 'metadata.recommendations': true }),
      installed('a', 'Alpha', false, { 'metadata.relatedTitles': true }),
    ]);

    const info = await fetchProviderUiInfo({} as AppDrizzleDb);

    expect(info).toEqual([
      {
        id: 'a',
        name: 'Alpha',
        enabled: false,
        capabilities: { 'metadata.relatedTitles': true },
      },
      {
        id: 'z',
        name: 'Zeta',
        enabled: true,
        capabilities: { 'metadata.recommendations': true },
      },
    ]);
  });
});
