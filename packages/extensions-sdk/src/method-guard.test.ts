import { describe, expect, it } from 'vitest';
import { toProviderId, toProviderMangaId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import { defineProvider } from './define-provider';
import { providerMethodGuard } from './validate-contract';

const manifestNoDetails: ProviderManifest = {
  id: toProviderId('p1'),
  name: 'P',
  version: '1',
  source: { url: 'https://s' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

describe('providerMethodGuard', () => {
  it('rejects getDetails when manifest lacks metadata.details', () => {
    const provider = defineProvider({
      manifest: manifestNoDetails,
      getDetails: async () => ({
        providerMangaId: toProviderMangaId('m1'),
        titles: [{ value: 'T' }],
      }),
    });
    const r = providerMethodGuard(manifestNoDetails, provider, 'getDetails');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('extensions.sdk.contract.capability_unavailable');
  });

  it('returns method_unavailable when capability ok but method missing', () => {
    const provider = defineProvider({
      manifest: manifestNoDetails,
    });
    const r = providerMethodGuard(manifestNoDetails, provider, 'search');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('extensions.sdk.contract.method_unavailable');
  });
});
