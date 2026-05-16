import { describe, expect, it } from 'vitest';
import type { ProviderManifest } from '@app/shared';
import { toProviderId } from '@app/shared';

import { validateManifestInstallPolicy, type ExtensionInstallPolicy } from './install-policy.js';

function makeManifest(overrides: Partial<ProviderManifest['compatibility']> = {}): ProviderManifest {
  return {
    id: toProviderId('test'),
    name: 'Test Provider',
    version: '1.0.0',
    source: { url: 'https://example.com' },
    compatibility: {
      platforms: ['web', 'desktop'],
      minAppVersion: '1.0.0',
      maxAppVersion: '3.0.0',
      ...overrides,
    },
    capabilities: { 'discovery.search': true },
    permissions: ['network.http'],
    languages: ['en'],
    contentFlags: { nsfw: false, suggestive: false, violence: false },
  };
}

describe('validateManifestInstallPolicy', () => {
  it('passes when policy.runtime is in manifest.compatibility.platforms', () => {
    const manifest = makeManifest({ platforms: ['web', 'desktop'] });
    const policy: ExtensionInstallPolicy = { runtime: 'web' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(true);
  });

  it('rejects when policy.runtime is not in manifest.compatibility.platforms', () => {
    const manifest = makeManifest({ platforms: ['web', 'desktop'] });
    const policy: ExtensionInstallPolicy = { runtime: 'mobile' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('extensions.core.policy.runtime_mismatch');
    }
  });

  it('rejects app version below minAppVersion', () => {
    const manifest = makeManifest({ minAppVersion: '2.0.0' });
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '1.0.0' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('extensions.core.policy.app_version_too_low');
    }
  });

  it('rejects app version above maxAppVersion', () => {
    const manifest = makeManifest({ maxAppVersion: '2.0.0' });
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '3.0.0' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('extensions.core.policy.app_version_too_high');
    }
  });

  it('passes when app version is within range', () => {
    const manifest = makeManifest({ minAppVersion: '1.0.0', maxAppVersion: '3.0.0' });
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '2.0.0' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(true);
  });

  it('passes when policy has no appVersion even with version constraints', () => {
    const manifest = makeManifest({ minAppVersion: '1.0.0', maxAppVersion: '3.0.0' });
    const policy: ExtensionInstallPolicy = { runtime: 'web' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(true);
  });

  it('passes when manifest has no version constraints', () => {
    const manifest = makeManifest({ minAppVersion: undefined, maxAppVersion: undefined });
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '99.0.0' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(true);
  });

  it('handles single-segment versions', () => {
    const manifest = makeManifest({ minAppVersion: '5', maxAppVersion: '10' });
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '6' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(true);
  });

  it('handles multi-segment versions', () => {
    const manifest = makeManifest({ minAppVersion: '1.0.0', maxAppVersion: '1.999.999' });
    const policy: ExtensionInstallPolicy = { runtime: 'web', appVersion: '1.5.50' };
    const result = validateManifestInstallPolicy(manifest, policy);
    expect(result.ok).toBe(true);
  });

  it('rejects malformed policy appVersion', () => {
    const manifest = makeManifest({ minAppVersion: '1.0.0' });
    const result = validateManifestInstallPolicy(manifest, {
      runtime: 'web',
      appVersion: 'not-a-version',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('extensions.core.policy.invalid_version');
  });

  it('rejects malformed manifest minAppVersion', () => {
    const manifest = makeManifest({ minAppVersion: 'bad' });
    const result = validateManifestInstallPolicy(manifest, {
      runtime: 'web',
      appVersion: '1.0.0',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('extensions.core.policy.invalid_version');
  });
});