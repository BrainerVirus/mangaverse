import { describe, expect, it } from 'vitest';
import { toExtensionInstallId, toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';
import { createSqlJsHarness } from '@app/db/testing';
import type { AppDrizzleDb } from '@app/db';

import { confirmExtensionInstall } from './confirm-install.js';
import { createExtensionInstallSession, transitionExtensionInstall } from './install-session.js';
import type { ExtensionInstallPreview } from './install-types.js';
import { getProviderSettings, saveProviderSettings } from './settings-persistence.js';
import { listInstalledProviders } from './providers-ops.js';
import { listProviderActivity } from './extension-logs.js';
import { applyProviderUpdate, checkProviderUpdate } from './update-check.js';

const manifestV1: ProviderManifest = {
  id: toProviderId('update-demo'),
  name: 'Update Demo',
  version: '1.0.0',
  source: { url: 'https://example.com/provider' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true, 'metadata.languages': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

const manifestUrl = 'https://example.com/provider.json';

function preview(m: ProviderManifest): ExtensionInstallPreview {
  return {
    providerName: m.name,
    providerId: m.id,
    version: m.version,
    sourceUrl: m.source.url,
    manifestUrl,
    platforms: m.compatibility.platforms,
    capabilities: m.capabilities,
    capabilityLimitations: [],
    permissions: m.permissions,
    languages: m.languages,
    contentFlags: m.contentFlags,
    checksumStatus: 'absent',
    signatureStatus: 'absent',
    warnings: [],
  };
}

async function install(db: AppDrizzleDb, m: ProviderManifest = manifestV1): Promise<void> {
  let session = createExtensionInstallSession();
  session = transitionExtensionInstall(session, { type: 'startFromManualUrl', url: manifestUrl });
  session = transitionExtensionInstall(session, {
    type: 'manifestFetched',
    manifest: m,
    preview: preview(m),
    source: { kind: 'manual', manifestUrl },
  });
  const result = await confirmExtensionInstall(session, { db });
  expect(result.ok).toBe(true);
}

function remoteFetch(manifest: unknown): () => Promise<Response> {
  return async () =>
    new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

const providerId = toExtensionInstallId(String(manifestV1.id));

describe('checkProviderUpdate', () => {
  it('reports an available update with the remote manifest', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const result = await checkProviderUpdate(providerId, {
      db,
      fetch: remoteFetch({ ...manifestV1, version: '1.1.0' }),
    });

    expect(result.status).toBe('available');
    expect(result.remoteVersion).toBe('1.1.0');
    expect(result.remoteManifest?.version).toBe('1.1.0');
    const activity = await listProviderActivity(db, providerId);
    expect(activity[0]?.code).toBe('extensions.update_check.available');
  });

  it('reports up to date and older remote versions without offering an update', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const same = await checkProviderUpdate(providerId, {
      db,
      fetch: remoteFetch(manifestV1),
    });
    expect(same.status).toBe('up-to-date');
    expect(same.remoteManifest).toBeUndefined();

    const older = await checkProviderUpdate(providerId, {
      db,
      fetch: remoteFetch({ ...manifestV1, version: '0.9.0' }),
    });
    expect(older.status).toBe('older');
    expect(older.remoteManifest).toBeUndefined();
  });

  it('rejects a remote manifest for another provider or a malformed version', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const other = await checkProviderUpdate(providerId, {
      db,
      fetch: remoteFetch({ ...manifestV1, id: 'someone-else', version: '2.0.0' }),
    });
    expect(other.status).toBe('invalid');

    const malformed = await checkProviderUpdate(providerId, {
      db,
      fetch: remoteFetch({ ...manifestV1, version: '2.0' }),
    });
    expect(malformed.status).toBe('invalid');
    expect(malformed.message).toBe('Remote manifest version is not valid semver.');
  });

  it('reports invalid JSON and network failures without writing installation state', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const invalid = await checkProviderUpdate(providerId, {
      db,
      fetch: async () => new Response('not json', { status: 200 }),
    });
    expect(invalid.status).toBe('invalid');

    const network = await checkProviderUpdate(providerId, {
      db,
      fetch: async () => {
        throw new Error('offline');
      },
    });
    expect(network.status).toBe('network-error');

    const installed = await listInstalledProviders(db);
    if (!installed.ok) throw new Error('expected installed list');
    expect(installed.value[0]?.installedVersion).toBe('1.0.0');
  });

  it('reports a missing manifest URL', async () => {
    const { db, raw } = await createSqlJsHarness();
    await install(db);
    // Bundled installs have no manifest URL; simulate that state on the same row.
    raw.run('UPDATE installed_extensions SET manifest_url = NULL');

    const result = await checkProviderUpdate(providerId, { db, fetch: remoteFetch(manifestV1) });
    expect(result.status).toBe('no-manifest-url');
  });
});

describe('applyProviderUpdate', () => {
  it('updates the manifest while preserving enabled state and settings', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);
    const saved = await saveProviderSettings(
      manifestV1,
      { preferredLanguages: ['ja'], enabled: true },
      { db },
    );
    expect(saved.ok).toBe(true);

    const check = await checkProviderUpdate(providerId, {
      db,
      fetch: remoteFetch({ ...manifestV1, version: '1.2.0' }),
    });
    if (check.remoteManifest === undefined) throw new Error('expected remote manifest');

    const applied = await applyProviderUpdate(providerId, check.remoteManifest, { db });
    expect(applied.ok).toBe(true);

    const installed = await listInstalledProviders(db);
    if (!installed.ok) throw new Error('expected installed list');
    expect(installed.value[0]?.installedVersion).toBe('1.2.0');
    expect(installed.value[0]?.manifest.version).toBe('1.2.0');
    expect(installed.value[0]?.enabled).toBe(true);

    const settings = await getProviderSettings(providerId, { db });
    expect(settings.ok).toBe(true);
    if (!settings.ok) return;
    expect(settings.value.preferredLanguages).toEqual(['ja']);

    const activity = await listProviderActivity(db, providerId);
    expect(activity[0]?.code).toBe('extensions.ops.updated');
  });

  it('refuses a same or older version', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const same = await applyProviderUpdate(providerId, manifestV1, { db });
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.error.code).toBe('extensions.update.not_newer');

    const older = await applyProviderUpdate(
      providerId,
      { ...manifestV1, version: '0.5.0' },
      { db },
    );
    expect(older.ok).toBe(false);
  });
});
