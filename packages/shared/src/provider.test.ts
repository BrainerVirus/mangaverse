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
    if (!res.ok) {
      throw new Error('expected res.ok to be true');
    }
    expect(res.value.id).toEqual(toProviderId('demo'));
    expect(res.value.capabilities['discovery.search']).toBe(true);
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
    if (!res.ok) {
      throw new Error('expected res.ok to be true');
    }
    expect(res.value.checksum).toBe('sha256:abc123');
    expect(res.value.signature).toBe('sig:demo');
    expect(res.value.source.publisher).toBe('Test Publisher');
    expect(res.value.capabilityDetails?.[0]?.key).toBe('discovery.search');
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
    expect(
      validateProviderManifest({
        ...validManifestInput,
        source: { url: 'https://' },
      }).ok,
    ).toBe(false);

    expect(
      validateProviderManifest({
        ...validManifestInput,
        source: { url: 'https:// bad' },
      }).ok,
    ).toBe(false);
  });
});

describe('validateProviderManifest error compatibility', () => {
  const messageOf = (input: unknown): string => {
    const res = validateProviderManifest(input);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected failure');
    expect(res.error.code).toBe('provider.manifest.invalid');
    return res.error.message;
  };

  it('keeps the legacy message for a non-object manifest', () => {
    expect(messageOf(null)).toBe('Manifest must be an object.');
    expect(messageOf('nope')).toBe('Manifest must be an object.');
  });

  it('keeps the legacy messages for required top-level fields', () => {
    expect(messageOf({})).toBe('Manifest id is required.');
    expect(messageOf({ ...validManifestInput, name: '  ' })).toBe('Manifest name is required.');
    expect(messageOf({ ...validManifestInput, version: 5 })).toBe('Manifest version is required.');
  });

  it('keeps the legacy messages for source URLs', () => {
    expect(messageOf({ ...validManifestInput, source: undefined })).toBe(
      'Manifest source.url must be a valid http/https URL.',
    );
    expect(messageOf({ ...validManifestInput, source: { url: 'ftp://x' } })).toBe(
      'Manifest source.url must be a valid http/https URL.',
    );
    expect(
      messageOf({ ...validManifestInput, source: { url: 'https://x', homepageUrl: 'file:///x' } }),
    ).toBe('Manifest source.homepageUrl must be a valid http/https URL.');
    expect(
      messageOf({
        ...validManifestInput,
        source: { url: 'https://x', manifestUrl: 'javascript:alert(1)' },
      }),
    ).toBe('Manifest source.manifestUrl must be a valid http/https URL.');
  });

  it('keeps the legacy messages for compatibility platforms', () => {
    expect(messageOf({ ...validManifestInput, compatibility: { platforms: [] } })).toBe(
      'Manifest compatibility.platforms must be a non-empty array.',
    );
    expect(messageOf({ ...validManifestInput, compatibility: {} })).toBe(
      'Manifest compatibility.platforms must be a non-empty array.',
    );
    expect(messageOf({ ...validManifestInput, compatibility: { platforms: ['ios'] } })).toBe(
      'Manifest compatibility.platforms has invalid entry.',
    );
    expect(messageOf({ ...validManifestInput, compatibility: null })).toBe(
      'Manifest compatibility is required.',
    );
  });

  it('keeps the legacy messages for capabilities', () => {
    const expected = 'Manifest capabilities must be a non-empty object of known boolean flags.';
    expect(messageOf({ ...validManifestInput, capabilities: {} })).toBe(expected);
    expect(messageOf({ ...validManifestInput, capabilities: { 'made.up': true } })).toBe(expected);
    expect(messageOf({ ...validManifestInput, capabilities: { 'metadata.details': 'yes' } })).toBe(
      expected,
    );
    expect(messageOf({ ...validManifestInput, capabilities: [] })).toBe(expected);
  });

  it('keeps the legacy messages for capability details', () => {
    expect(messageOf({ ...validManifestInput, capabilityDetails: 'nope' })).toBe(
      'Manifest capabilityDetails must be an array.',
    );
    expect(messageOf({ ...validManifestInput, capabilityDetails: [null] })).toBe(
      'Each capability detail must be an object.',
    );
    expect(
      messageOf({
        ...validManifestInput,
        capabilityDetails: [{ key: 'unknown.capability', supported: true }],
      }),
    ).toBe('Capability detail key is invalid.');
    expect(
      messageOf({
        ...validManifestInput,
        capabilityDetails: [{ key: 'discovery.search', supported: 'yes' }],
      }),
    ).toBe('Capability detail supported must be boolean.');
    expect(
      messageOf({
        ...validManifestInput,
        capabilityDetails: [{ key: 'discovery.search', supported: true, rateLimitRpm: -1 }],
      }),
    ).toBe('Capability detail rateLimitRpm must be non-negative.');
    expect(
      messageOf({
        ...validManifestInput,
        capabilityDetails: [{ key: 'discovery.search', supported: true, requiresAuth: 'no' }],
      }),
    ).toBe('Capability detail requiresAuth must be boolean.');
    expect(
      messageOf({
        ...validManifestInput,
        capabilityDetails: [{ key: 'discovery.search', supported: true, knownRestrictions: [''] }],
      }),
    ).toBe('Capability detail knownRestrictions must be non-empty strings.');
  });

  it('keeps the legacy messages for permissions and languages', () => {
    expect(messageOf({ ...validManifestInput, permissions: [] })).toBe(
      'Manifest permissions must be a non-empty array.',
    );
    expect(messageOf({ ...validManifestInput, permissions: ['root'] })).toBe(
      'Manifest permissions contains unknown permission.',
    );
    expect(messageOf({ ...validManifestInput, languages: [] })).toBe(
      'Manifest languages must be a non-empty array of non-empty strings.',
    );
    expect(messageOf({ ...validManifestInput, languages: [' '] })).toBe(
      'Manifest languages must be a non-empty array of non-empty strings.',
    );
  });

  it('keeps the legacy messages for content flags', () => {
    expect(messageOf({ ...validManifestInput, contentFlags: null })).toBe(
      'Manifest contentFlags is required.',
    );
    expect(
      messageOf({
        ...validManifestInput,
        contentFlags: { nsfw: 'yes', suggestive: false, violence: false },
      }),
    ).toBe('Manifest contentFlags.nsfw must be boolean.');
    expect(
      messageOf({
        ...validManifestInput,
        contentFlags: { nsfw: false, suggestive: false, violence: 'yes' },
      }),
    ).toBe('Manifest contentFlags.violence must be boolean.');
  });

  it('drops malformed optional metadata instead of rejecting the manifest', () => {
    const res = validateProviderManifest({
      ...validManifestInput,
      description: 5,
      checksum: 42,
      signature: '   ',
      source: { ...validManifestInput.source, publisher: 7 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected res.ok to be true');
    expect(res.value.description).toBeUndefined();
    expect(res.value.checksum).toBeUndefined();
    expect(res.value.signature).toBeUndefined();
    expect(res.value.source.publisher).toBeUndefined();
  });
});
