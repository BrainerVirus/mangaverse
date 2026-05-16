import { describe, expect, it } from 'vitest';
import { toExtensionInstallId, toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';
import type { AppDrizzleDb } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';

import { confirmExtensionInstall } from './confirm-install.js';
import {
  createExtensionInstallSession,
  transitionExtensionInstall,
} from './install-session.js';
import type { ExtensionInstallPreview } from './install-types.js';
import {
  listInstalledProviders,
  markProviderBroken,
  uninstallInstalledProvider,
  updateInstalledProviderManifest,
} from './providers-ops.js';

const manifestV1: ProviderManifest = {
  id: toProviderId('demo'),
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web', 'desktop'] },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

const manifestV2: ProviderManifest = {
  ...manifestV1,
  version: '2.0.0',
  source: { ...manifestV1.source, url: 'https://example.com/v2' },
};

const preview = (m: ProviderManifest, url: string): ExtensionInstallPreview => ({
  providerName: m.name,
  providerId: m.id,
  version: m.version,
  sourceUrl: m.source.url,
  manifestUrl: url,
  platforms: m.compatibility.platforms,
  capabilities: m.capabilities,
  capabilityLimitations: [],
  permissions: m.permissions,
  languages: m.languages,
  contentFlags: m.contentFlags,
  checksumStatus: 'absent',
  signatureStatus: 'absent',
  warnings: [],
});

async function confirmSession(db: AppDrizzleDb, m: ProviderManifest, url: string) {
  let session = createExtensionInstallSession();
  session = transitionExtensionInstall(session, { type: 'startFromManualUrl', url });
  session = transitionExtensionInstall(session, {
    type: 'manifestFetched',
    manifest: m,
    preview: preview(m, url),
    source: { kind: 'manual', manifestUrl: url },
  });
  return confirmExtensionInstall(session, { db });
}

describe('confirmExtensionInstall', () => {
  it('persists installed extension with deterministic id', async () => {
    const { db } = await createSqlJsHarness();
    const url = 'https://example.com/m.json';
    const r = await confirmSession(db, manifestV1, url);
    expect(r.ok).toBe(true);
    const listed = await listInstalledProviders(db);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]!.id).toBe(toExtensionInstallId(String(manifestV1.id)));
    }
  });

  it('reinstalling same provider updates row and keeps single install', async () => {
    const { db } = await createSqlJsHarness();
    const url = 'https://example.com/m.json';
    expect((await confirmSession(db, manifestV1, url)).ok).toBe(true);
    expect((await confirmSession(db, manifestV2, url)).ok).toBe(true);
    const listed = await listInstalledProviders(db);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]!.installedVersion).toBe('2.0.0');
      expect(listed.value[0]!.sourceUrl).toBe(url);
      expect(listed.value[0]!.manifest.version).toBe('2.0.0');
    }
  });
});

describe('markProviderBroken', () => {
  it('marks provider broken without throwing', async () => {
    const { db } = await createSqlJsHarness();
    const url = 'https://example.com/m.json';
    await confirmSession(db, manifestV1, url);
    const listed = await listInstalledProviders(db);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const id = listed.value[0]!.id;
    const br = await markProviderBroken(id, { code: 'x', message: 'broken' }, { db });
    expect(br.ok).toBe(true);
    const listed2 = await listInstalledProviders(db);
    if (listed2.ok) {
      expect(listed2.value[0]?.health).toBe('broken');
    }
  });
});

describe('uninstallInstalledProvider', () => {
  it('removes installed provider', async () => {
    const { db } = await createSqlJsHarness();
    const url = 'https://example.com/m.json';
    await confirmSession(db, manifestV1, url);
    const listed = await listInstalledProviders(db);
    if (!listed.ok) return;
    const id = listed.value[0]!.id;
    const u = await uninstallInstalledProvider(id, { db });
    expect(u.ok).toBe(true);
    const listed2 = await listInstalledProviders(db);
    if (listed2.ok) expect(listed2.value).toHaveLength(0);
  });
});

describe('updateInstalledProviderManifest', () => {
  it('updates manifest and version without changing install id', async () => {
    const { db } = await createSqlJsHarness();
    const url = 'https://example.com/m.json';
    await confirmSession(db, manifestV1, url);
    const extId = toExtensionInstallId(String(manifestV1.id));
    const up = await updateInstalledProviderManifest(extId, manifestV2, { db });
    expect(up.ok).toBe(true);
    const listed = await listInstalledProviders(db);
    if (listed.ok && listed.value[0]) {
      expect(listed.value[0].id).toBe(extId);
      expect(listed.value[0].installedVersion).toBe('2.0.0');
      expect(listed.value[0].manifest.version).toBe('2.0.0');
    }
  });
});
