import { describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import { createMockProvider } from './mock-provider';
import { defineProvider } from './define-provider';
import { runProviderContractTests } from './contract-tests';
import { validateProviderContract } from './validate-contract';

const manifest: ProviderManifest = {
  id: toProviderId('demo'),
  name: 'Demo',
  version: '1',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

describe('validateProviderContract', () => {
  it('passes mock that implements required methods', () => {
    const p = createMockProvider({ manifest });
    const r = validateProviderContract(manifest, p);
    expect(r.ok).toBe(true);
  });

  it('fails when method missing', () => {
    const p = createMockProvider({
      manifest,
      methods: new Set(),
    });
    const r = validateProviderContract(manifest, p);
    expect(r.ok).toBe(false);
  });
});

describe('runProviderContractTests', () => {
  it('reports ok for valid mock', async () => {
    const p = createMockProvider({ manifest });
    const r = await runProviderContractTests({ manifest, provider: p });
    expect(r.ok).toBe(true);
  });

  it('reports failure when required method throws', async () => {
    const base = createMockProvider({ manifest });
    const throwing = defineProvider({
      ...base,
      search: async () => {
        throw new Error('boom');
      },
    });
    const r = await runProviderContractTests({ manifest, provider: throwing });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.method === 'search')).toBe(true);
  });
});
