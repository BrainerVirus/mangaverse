import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebPlatformAdapter } from './web.js';

/**
 * `deriveWebEnvironment` only needs `window`/`document` to exist and a
 * `navigator.storage`; a node test can supply those temporarily without pulling
 * jsdom into this package (knip would then require jsdom as a dependency).
 */
function installBrowserGlobals(): () => void {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage');

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      open: vi.fn<(url: string) => void>(),
      location: { assign: vi.fn<(url: string) => void>() },
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: {}, createElement: () => ({ click: vi.fn<() => void>() }) },
  });
  Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: {
      estimate: async () => ({ quota: 1024, usage: 0 }),
      persisted: async () => true,
    },
  });

  return () => {
    if (windowDescriptor === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, 'window', windowDescriptor);
    if (documentDescriptor === undefined) delete (globalThis as { document?: unknown }).document;
    else Object.defineProperty(globalThis, 'document', documentDescriptor);
    if (storageDescriptor === undefined)
      delete (globalThis.navigator as { storage?: unknown }).storage;
    else Object.defineProperty(globalThis.navigator, 'storage', storageDescriptor);
  };
}

describe('web environment merging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps derived browser dependencies when a partial environment is injected', async () => {
    const restore = installBrowserGlobals();
    try {
      const persisted = vi.fn<() => Promise<boolean>>(async () => true);
      Object.defineProperty(globalThis.navigator, 'storage', {
        configurable: true,
        value: {
          estimate: async () => ({ quota: 1024, usage: 0 }),
          persist: persisted,
          persisted: async () => true,
        },
      });

      const refusals: unknown[] = [];
      const adapter = createWebPlatformAdapter({
        onProviderRequestRefused: (refusal) => refusals.push(refusal),
      });

      // Before the merge fix, passing any environment replaced the derived one and
      // storage.persist returned platform.unsupported, which broke the storage page.
      const result = await adapter.storage.persist();
      expect(result.ok && result.value).toBe(true);
      expect(persisted).toHaveBeenCalledOnce();

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
    } finally {
      restore();
    }
  });
});
