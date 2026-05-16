import { describe, expect, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import {
  hasProviderCapability,
  validateProviderManifest,
  type ProviderCapabilityMap,
  type ProviderManifest,
} from './provider';
import { toProviderId } from './manga';

const validManifestInput = {
  id: 'demo',
  name: 'Demo Provider',
  version: '1.0.0',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web', 'desktop'] },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

describe('provider manifest', () => {
  it('hasProviderCapability reads structured capability map', () => {
    const manifest: ProviderManifest = {
      id: toProviderId('demo'),
      name: 'Demo Provider',
      version: '1.0.0',
      source: { url: 'https://example.com' },
      compatibility: { platforms: ['web'] },
      capabilities: { 'metadata.details': true },
      permissions: ['network.http'],
      languages: ['en'],
      contentFlags: { nsfw: false, suggestive: false, violence: false },
    };
    expect(hasProviderCapability(manifest, 'metadata.details')).toBe(true);
    expect(hasProviderCapability(manifest, 'discovery.search')).toBe(false);
  });

  it('validateProviderManifest accepts a complete manifest', () => {
    const res = validateProviderManifest(validManifestInput);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.id).toEqual(toProviderId('demo'));
      expect(res.value.capabilities['discovery.search']).toBe(true);
    }
  });

  it('validateProviderManifest rejects missing required sections', () => {
    expect(validateProviderManifest(null).ok).toBe(false);
    expect(validateProviderManifest({}).ok).toBe(false);
    expect(validateProviderManifest({ ...validManifestInput, languages: [] }).ok).toBe(false);
    expect(validateProviderManifest({ ...validManifestInput, capabilities: {} }).ok).toBe(false);
  });

  it('validateProviderManifest accepts optional checksum and publisher', () => {
    const res = validateProviderManifest({
      ...validManifestInput,
      checksum: 'sha256:abc123',
      signature: 'sig:demo',
      source: { ...validManifestInput.source, publisher: 'Test Publisher' },
      capabilityDetails: [
        {
          key: 'discovery.search',
          supported: true,
          rateLimitRpm: 60,
          requiresAuth: false,
          knownRestrictions: ['No advanced filters'],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.checksum).toBe('sha256:abc123');
      expect(res.value.signature).toBe('sig:demo');
      expect(res.value.source.publisher).toBe('Test Publisher');
      expect(res.value.capabilityDetails?.[0]?.key).toBe('discovery.search');
    }
  });

  it('validateProviderManifest rejects invalid capability details', () => {
    const res = validateProviderManifest({
      ...validManifestInput,
      capabilityDetails: [{ key: 'unknown.capability', supported: true }],
    });
    expect(res.ok).toBe(false);
  });

  it('type: capability map keys align with manifest field', () => {
    expectTypeOf<ProviderManifest['capabilities']>().toEqualTypeOf<ProviderCapabilityMap>();
  });

  it('validateProviderManifest rejects javascript: scheme in source.url', () => {
    const res = validateProviderManifest({
      ...validManifestInput,
      source: { url: 'javascript:alert(1)' },
    });
    expect(res.ok).toBe(false);
  });

  it('validateProviderManifest rejects file: scheme in source.homepageUrl', () => {
    const res = validateProviderManifest({
      ...validManifestInput,
      source: { url: 'https://example.com', homepageUrl: 'file:///tmp/x' },
    });
    expect(res.ok).toBe(false);
  });

  it('validateProviderManifest rejects ftp: scheme in source.manifestUrl', () => {
    const res = validateProviderManifest({
      ...validManifestInput,
      source: { url: 'https://example.com', manifestUrl: 'ftp://example.com/m.json' },
    });
    expect(res.ok).toBe(false);
  });

  it('validateProviderManifest accepts http: and https: in source.homepageUrl', () => {
    const res1 = validateProviderManifest({
      ...validManifestInput,
      source: { url: 'https://example.com', homepageUrl: 'http://example.com' },
    });
    expect(res1.ok).toBe(true);

    const res2 = validateProviderManifest({
      ...validManifestInput,
      source: { url: 'https://example.com', manifestUrl: 'https://example.com/manifest.json' },
    });
    expect(res2.ok).toBe(true);
  });

  it('validateProviderManifest rejects malformed http source URLs', () => {
    expect(validateProviderManifest({
      ...validManifestInput,
      source: { url: 'https://' },
    }).ok).toBe(false);

    expect(validateProviderManifest({
      ...validManifestInput,
      source: { url: 'https:// bad' },
    }).ok).toBe(false);
  });
});
