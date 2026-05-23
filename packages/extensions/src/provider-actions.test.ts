import { describe, expect, it } from 'vitest';
import { upsertInstalledExtension } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { listInstalledProviders } from '@app/extensions-core';

import { demoInstallMetadata } from './fetch-extensions-page.js';
import { removeProvider, setProviderEnabled } from './provider-actions.js';

describe('provider actions', () => {
  it('toggles provider enabled state', async () => {
    const { db } = await createSqlJsHarness();
    const metadata = demoInstallMetadata();
    await upsertInstalledExtension(db, metadata);

    expect((await setProviderEnabled(db, metadata.id, false)).ok).toBe(true);
    let listed = await listInstalledProviders(db);
    expect(listed.ok && listed.value[0]?.enabled).toBe(false);

    expect((await setProviderEnabled(db, metadata.id, true)).ok).toBe(true);
    listed = await listInstalledProviders(db);
    expect(listed.ok && listed.value[0]?.enabled).toBe(true);
  });

  it('removes installed provider', async () => {
    const { db } = await createSqlJsHarness();
    const metadata = demoInstallMetadata();
    await upsertInstalledExtension(db, metadata);

    expect((await removeProvider(db, metadata.id)).ok).toBe(true);
    const listed = await listInstalledProviders(db);
    expect(listed.ok && listed.value).toHaveLength(0);
  });
});
