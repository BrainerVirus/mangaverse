import { describe, expect, it, vi } from 'vitest';
import { toExtensionInstallId, toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';
import { createSqlJsHarness } from '@app/db/testing';
import type { AppDrizzleDb } from '@app/db';

import { confirmExtensionInstall } from './confirm-install.js';
import { createExtensionInstallSession, transitionExtensionInstall } from './install-session.js';
import type { ExtensionInstallPreview } from './install-types.js';
import {
  listInstalledProviders,
  disableInstalledProvider,
  enableInstalledProvider,
  markProviderBroken,
} from './providers-ops.js';
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

  it('orders numeric prerelease identifiers numerically', () => {
    expect(compareSemver('1.0.0-rc.9', '1.0.0-rc.10')).toBeLessThan(0);
    expect(compareSemver('1.0.0-rc.10', '1.0.0-rc.9')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0);
  });

  it('keeps hyphenated prerelease identifiers intact and ignores build metadata', () => {
    expect(parseSemver('1.0.0-beta-2')).toEqual([1, 0, 0, 'beta-2']);
    expect(compareSemver('1.0.0-beta-2', '1.0.0-beta')).toBeGreaterThan(0);
    expect(parseSemver('1.0.0+build.7')).toEqual([1, 0, 0, null]);
    expect(compareSemver('1.0.0+build.2', '1.0.0+build.1')).toBe(0);
  });

  it('rejects malformed versions', () => {
    expect(parseSemver('1.2.3-')).toBeNull();
    expect(parseSemver('1.2.3-beta..1')).toBeNull();
    expect(parseSemver('1.2.3-01')).toBeNull();
    expect(compareSemver('1.2.3', 'not-a-version')).toBeNull();
  });

  it('rejects leading zeros in core identifiers while keeping ordering', () => {
    expect(parseSemver('01.2.3')).toBeNull();
    expect(parseSemver('1.02.3')).toBeNull();
    expect(parseSemver('1.2.03')).toBeNull();
    expect(parseSemver('0.1.2')).toEqual([0, 1, 2, null]);
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('1.2.3', '01.2.3')).toBeNull();
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

  it('stores degraded for a transient network failure without persisting broken', async () => {
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
    expect(installed.value[0]?.health).toBe('degraded');
    expect(installed.value[0]?.enabled).toBe(true);
    const activity = await listProviderActivity(db, providerId);
    expect(activity[0]?.code).toBe('extensions.health.degraded');
  });

  it('clears a broken health to degraded when only the network probe fails', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);
    await markProviderBroken(providerId, { code: 'x', message: 'broken' }, { db });
    expect((await enableInstalledProvider(providerId, { db })).ok).toBe(true);

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
      includeNetwork: true,
      networkProbe: async () => {
        throw new Error('Network still down');
      },
    });

    expect(report.status).toBe('degraded');
    const installed = await listInstalledProviders(db);
    if (!installed.ok) throw new Error('expected installed list');
    expect(installed.value[0]?.health).toBe('degraded');
    expect(installed.value[0]?.enabled).toBe(true);
    const activity = await listProviderActivity(db, providerId);
    expect(activity[0]?.code).toBe('extensions.health.degraded');
  });

  it('does not roll back an enable/disable change made during the check', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
      includeNetwork: true,
      networkProbe: async () => {
        const disabled = await disableInstalledProvider(providerId, { db });
        expect(disabled.ok).toBe(true);
        throw new Error('Network down');
      },
    });

    expect(report.status).toBe('degraded');
    const installed = await listInstalledProviders(db);
    if (!installed.ok) throw new Error('expected installed list');
    expect(installed.value[0]?.enabled).toBe(false);
    expect(installed.value[0]?.health).toBe('degraded');
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

    // markProviderBroken disables the provider; a recovered check must let the
    // user turn it back on instead of leaving the toggle stuck disabled.
    const enabled = await enableInstalledProvider(providerId, { db });
    expect(enabled.ok).toBe(true);
    const afterEnable = await listInstalledProviders(db);
    if (!afterEnable.ok) throw new Error('expected installed list');
    expect(afterEnable.value[0]?.enabled).toBe(true);
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

  it('fails a non-http source URL even when the manifest stays valid', async () => {
    const { db, raw } = await createSqlJsHarness();
    await install(db);
    raw.run("UPDATE installed_extensions SET source_url = 'ftp://example.com/provider'");

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
    });

    expect(report.status).toBe('broken');
    expect(report.checks.find((item) => item.id === 'source-url')?.status).toBe('fail');
    expect(report.checks.find((item) => item.id === 'source-url')?.reason).toBe(
      'Source URL must be an http(s) URL.',
    );
  });

  it('fails when the installed version diverges from the manifest version', async () => {
    const { db, raw } = await createSqlJsHarness();
    await install(db);
    raw.run("UPDATE installed_extensions SET installed_version = '1.2.3'");

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
    });

    expect(report.status).toBe('broken');
    expect(report.checks.find((item) => item.id === 'version')?.status).toBe('fail');
    expect(report.checks.find((item) => item.id === 'version')?.reason).toBe(
      'Installed version does not match the manifest version.',
    );
  });

  it('skips the network probe for a disabled provider without failing the report', async () => {
    const { db } = await createSqlJsHarness();
    await install(db);
    const disabled = await disableInstalledProvider(providerId, { db });
    expect(disabled.ok).toBe(true);
    const probe = vi.fn<() => Promise<void>>(async () => {});

    const report = await runProviderHealthCheck(providerId, {
      db,
      runtimeAvailable: () => true,
      includeNetwork: true,
      networkProbe: probe,
    });

    expect(probe).not.toHaveBeenCalled();
    expect(report.networkChecked).toBe(false);
    expect(report.status).toBe('ok');
    expect(report.checks.find((item) => item.id === 'enabled')?.status).toBe('skipped');
    expect(report.checks.find((item) => item.id === 'network')?.status).toBe('skipped');
  });
});
