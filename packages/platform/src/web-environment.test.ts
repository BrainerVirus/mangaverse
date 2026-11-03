/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';

import { createWebPlatformAdapter } from './web.js';

describe('web environment merging', () => {
  it('keeps derived browser dependencies when a partial environment is injected', async () => {
    const persist = vi.fn<() => Promise<boolean>>(async () => true);
    Object.defineProperty(globalThis.navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ quota: 1024, usage: 0 }),
        persist,
        persisted: async () => true,
      },
    });

    const refusals: unknown[] = [];
    const adapter = createWebPlatformAdapter({
      onProviderRequestRefused: (refusal) => refusals.push(refusal),
    });

    // Before the merge fix, passing any environment replaced the derived one and
    // storage.persist returned platform.unsupported, which broke the storage page.
    const persisted = await adapter.storage.persist();
    expect(persisted.ok && persisted.value).toBe(true);
    expect(persist).toHaveBeenCalledOnce();

    await adapter.providerNetwork.replaceProviders(
      [{ providerId: 'partial-env-provider', domains: ['allowed.example'] }],
      1,
    );
    const refused = await adapter.providerNetwork.request({
      providerId: 'partial-env-provider',
      url: 'https://evil.example/secret',
    });
    expect(refused.ok).toBe(false);
    expect(refusals).toHaveLength(1);
  });
});
