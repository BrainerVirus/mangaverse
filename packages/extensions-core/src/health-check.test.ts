import { describe, expect, it } from 'vitest';
import { toExtensionInstallId, toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';
import { createSqlJsHarness } from '@app/db/testing';
import type { AppDrizzleDb } from '@app/db';

import { confirmExtensionInstall } from './confirm-install.js';
import { createExtensionInstallSession, transitionExtensionInstall } from './install-session.js';
import type { ExtensionInstallPreview } from './install-types.js';
import { listInstalledProviders, markProviderBroken } from './providers-ops.js';
import { parseSemver, compareSemver, runProviderHealthCheck } from './health-check.js';
import { listProviderActivity } from './extension-logs.js';

const manifest: ProviderManifest = {
  id: toProviderId('health-demo'),
  name: 'Health Demo',
  version: '1.0.0',
  source: { url: 'https://example.com/provider' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true, 'metadata.chapters': true },
  capabilityDetails: [{ key: 'metadata.chapters', supported: true, rateLimitRpm: 30 }],
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

function preview(m: ProviderManifest, url: string): ExtensionInstallPreview {
  return {
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
  };
}

async function install(db: AppDrizzleDb, m: ProviderManifest = manifest): Promise<void> {
  const url = 'https://example.com/provider.json';
  let session = createExtensionInstallSession();
  session = transitionExtensionInstall(session, { type: 'startFromManualUrl', url });
  session = transitionExtensionInstall(session, {
    type: 'manifestFetched',
    manifest: m,
    preview: preview(m, url),
    source: { kind: 'manual', manifestUrl: url },
  });
  const result = await confirmExtensionInstall(session, { db });
  expect(result.ok).toBe(true);
}

const providerId = toExtensionInstallId(String(manifest.id));

describe('semver helpers', () => {
  it('accepts only strict versions and orders prereleases below releases', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3, null]);
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('v1.2.3')).toBeNull();
    expect(parseSemver('1.2.3-beta.1')).toEqual([1, 2, 3, 'beta.1']);
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3-beta', '1.2.3')).toBeLessThan(0);
    expect(compareSemver('1.2', '1.2.3')).toBeNull();
  });
});

describe('runProviderHealthCheck', () => {
  it('passes every structural check and logs the result', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
    });

    expect(report.status).toBe('ok');
    expect(report.checks.every((item) => item.status !== 'fail')).toBe(true);
    expect(report.checks.find((item) => item.id === 'runtime')?.status).toBe('pass');
    const activity = await listProviderActivity(db, providerId);
    expect(activity[0]?.code).toBe('extensions.health.ok');
  });

  it('fails structurally without a runtime binding and marks metadata broken', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => false,
    });

    expect(report.status).toBe('broken');
    expect(report.checks.find((item) => item.id === 'runtime')?.status).toBe('fail');
    const installed = await listInstalledProviders(db);
    if (!installed.ok) throw new Error('expected installed list');
    expect(installed.value[0]?.health).toBe('broken');
  });

  it('reports a transient network failure as degraded without persisting broken', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
      includeNetwork: true,
      networkProbe: async () => {
        throw new Error('Network down');
      },
    });

    expect(report.status).toBe('degraded');
    expect(report.networkChecked).toBe(true);
    expect(report.checks.find((item) => item.id === 'network')?.status).toBe('degraded');
    const installed = await listInstalledProviders(db);
    if (!installed.ok) throw new Error('expected installed list');
    expect(installed.value[0]?.health).toBe('ok');
    const activity = await listProviderActivity(db, providerId);
    expect(activity[0]?.code).toBe('extensions.health.degraded');
  });

  it('treats a cancelled network check as degraded', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);
    const controller = new AbortController();
    controller.abort();

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
      includeNetwork: true,
      signal: controller.signal,
      networkProbe: async (signal) => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      },
    });

    expect(report.status).toBe('degraded');
    expect(report.checks.find((item) => item.id === 'network')?.reason).toBe(
      'Network check was cancelled.',
    );
  });

  it('restores health ok after a passing structural check', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);
    await markProviderBroken(providerId, { code: 'x', message: 'broken' }, { db });

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
    });

    expect(report.status).toBe('ok');
    const installed = await listInstalledProviders(db);
    if (!installed.ok) throw new Error('expected installed list');
    expect(installed.value[0]?.health).toBe('ok');
  });

  it('fails when capability details reference an undeclared capability', async () => {
    const { db } = await createSqlJsHarness();
    const mismatched: ProviderManifest = {
      ...manifest,
      capabilities: { 'discovery.search': true },
      capabilityDetails: [{ key: 'metadata.chapters', supported: true }],
    };
    await install(db, mismatched);

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
    });

    expect(report.status).toBe('broken');
    expect(report.checks.find((item) => item.id === 'capabilities')?.status).toBe('fail');
  });
});
