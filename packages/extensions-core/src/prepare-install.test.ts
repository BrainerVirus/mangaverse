import { describe, expect, it, vi } from 'vitest';

import { prepareManualExtensionInstall, prepareRegistryExtensionInstall } from './prepare-install';
import type { ExtensionInstallPolicy } from './install-policy.js';

const validJson = {
  id: 'demo',
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web', 'desktop'], minAppVersion: '1.0.0', maxAppVersion: '3.0.0' },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

describe('prepareManualExtensionInstall', () => {
  it('reaches awaiting confirmation on success', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const r = await prepareManualExtensionInstall('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.step).toBe('awaitingConfirmation');
  });

  it('lands manifestInvalid on bad manifest', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const r = await prepareManualExtensionInstall('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.step).toBe('manifestInvalid');
  });
});

describe('prepareRegistryExtensionInstall', () => {
  it('rejects file registry URL before fetch', async () => {
    const fetch = vi.fn();
    const r = await prepareRegistryExtensionInstall(
      'file:///tmp/index.json',
      { name: 'E', manifestUrl: 'https://example.com/m.json' },
      { fetch },
    );
    expect(r.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('normalizes manifest URL with path traversal', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const r = await prepareRegistryExtensionInstall(
      'https://registry.example.com',
      { name: 'E', manifestUrl: 'https://example.com/../manifest.json' },
      { fetch },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.step).toBe('awaitingConfirmation');
      expect(r.value.source.manifestUrl).toBe('https://example.com/manifest.json');
    }
  });
});

describe('policy enforcement', () => {
  it('rejects when policy.runtime is not in manifest platforms', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const policy: ExtensionInstallPolicy = { runtime: 'mobile' };
    const r = await prepareManualExtensionInstall('https://example.com/m.json', { fetch }, policy);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.step).toBe('manifestInvalid');
  });

  it('rejects when app version is below minAppVersion', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '0.5.0' };
    const r = await prepareManualExtensionInstall('https://example.com/m.json', { fetch }, policy);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.step).toBe('manifestInvalid');
  });

  it('rejects when app version is above maxAppVersion', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '4.0.0' };
    const r = await prepareManualExtensionInstall('https://example.com/m.json', { fetch }, policy);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.step).toBe('manifestInvalid');
  });

  it('passes when policy matches manifest compatibility', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '2.0.0' };
    const r = await prepareManualExtensionInstall('https://example.com/m.json', { fetch }, policy);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.step).toBe('awaitingConfirmation');
  });

  it('passes without policy (backward compatible)', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }));
    const r = await prepareManualExtensionInstall('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.step).toBe('awaitingConfirmation');
  });
});
