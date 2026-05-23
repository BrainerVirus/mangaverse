import { describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import {
  assertProviderSupports,
  getRequiredMethodsForCapabilities,
} from './capabilities';

function baseManifest(overrides: Partial<ProviderManifest> = {}): ProviderManifest {
  return {
    id: toProviderId('p1'),
    name: 'P',
    version: '1',
    source: { url: 'https://src.example' },
    compatibility: { platforms: ['web'] },
    capabilities: { 'discovery.search': true },
    permissions: ['network.http'],
    languages: ['en'],
    contentFlags: { nsfw: false, suggestive: false, violence: false },
    ...overrides,
  };
}

describe('getRequiredMethodsForCapabilities', () => {
  it('maps discovery.search to search', () => {
    const m = baseManifest();
    expect(getRequiredMethodsForCapabilities(m)).toContain('search');
  });

  it('requires getDownloadInfo when download capability is set', () => {
    const m = baseManifest({
      capabilities: { 'download.chapters': true },
    });
    expect(getRequiredMethodsForCapabilities(m)).toContain('getDownloadInfo');
  });
});

describe('assertProviderSupports', () => {
  it('returns true when capability matches method', () => {
    const m = baseManifest({ capabilities: { 'metadata.details': true } });
    expect(assertProviderSupports(m, 'getDetails')).toBe(true);
  });

  it('returns false when method not supported', () => {
    const m = baseManifest({ capabilities: { 'metadata.details': true } });
    expect(assertProviderSupports(m, 'search')).toBe(false);
  });
});
