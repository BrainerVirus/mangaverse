import { describe, expect, it } from 'vitest';
import { upsertInstalledExtension } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toExtensionInstallId, toProviderId } from '@app/shared';

import { demoInstallMetadata } from './fetch-extensions-page.js';
import { fetchProviderDetail } from './fetch-provider-detail.js';

describe('fetchProviderDetail', () => {
  it('returns provider detail with capabilities and permissions', async () => {
    const { db } = await createSqlJsHarness();
    const metadata = demoInstallMetadata();
    await upsertInstalledExtension(db, metadata);

    const detail = await fetchProviderDetail(db, metadata.id);
    expect(detail).not.toBeNull();
    expect(detail?.provider.manifest.name).toBe('Demo Provider');
    expect(detail?.capabilities.some((row) => row.key === 'discovery.search' && row.enabled)).toBe(true);
    expect(detail?.permissions.some((row) => row.key === 'network.http')).toBe(true);
  });

  it('returns null when provider is missing', async () => {
    const { db } = await createSqlJsHarness();
    const detail = await fetchProviderDetail(db, toExtensionInstallId('missing'));
    expect(detail).toBeNull();
  });

  it('loads saved provider settings when present', async () => {
    const { db } = await createSqlJsHarness();
    const metadata = demoInstallMetadata({
      manifest: {
        ...demoInstallMetadata().manifest,
        id: toProviderId('settings-provider'),
        name: 'Settings Provider',
      },
    });
    await upsertInstalledExtension(db, metadata);

    const detail = await fetchProviderDetail(db, metadata.id);
    expect(detail?.settings).toEqual({});
  });
});
