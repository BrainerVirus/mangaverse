import { describe, expect, it } from 'vitest';
import { upsertInstalledExtension } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toExtensionInstallId, toProviderId } from '@app/shared';

import { demoInstallMetadata, fetchExtensionsPage } from './fetch-extensions-page.js';

describe('fetchExtensionsPage', () => {
  it('returns installed providers sorted by name', async () => {
    const { db } = await createSqlJsHarness();

    const alphaManifest = {
      ...demoInstallMetadata().manifest,
      id: toProviderId('alpha-provider'),
      name: 'Alpha Provider',
    };
    const zetaManifest = {
      ...demoInstallMetadata().manifest,
      id: toProviderId('zeta-provider'),
      name: 'Zeta Provider',
    };

    await upsertInstalledExtension(
      db,
      demoInstallMetadata({
        id: toExtensionInstallId(String(zetaManifest.id)),
        manifest: zetaManifest,
      }),
    );
    await upsertInstalledExtension(
      db,
      demoInstallMetadata({
        id: toExtensionInstallId(String(alphaManifest.id)),
        manifest: alphaManifest,
      }),
    );

    const page = await fetchExtensionsPage(db);
    expect(page.providers).toHaveLength(2);
    expect(page.providers.map((provider) => provider.name)).toEqual(['Alpha Provider', 'Zeta Provider']);
    expect(page.providers[0]?.capabilityCount).toBeGreaterThan(0);
  });

  it('returns empty list when no providers are installed', async () => {
    const { db } = await createSqlJsHarness();
    const page = await fetchExtensionsPage(db);
    expect(page.providers).toEqual([]);
  });
});
