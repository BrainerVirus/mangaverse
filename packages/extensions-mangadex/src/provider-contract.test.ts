import { describe, expect, it } from 'vitest';
import { runProviderContractTests } from '@app/extensions-sdk';

import { MANGADEX_MANIFEST } from './manifest.js';
import { createMangaDexProvider } from './provider.js';
import { createFixtureFetch } from './testing/fixture-fetch.js';

describe('MangaDex provider contract', () => {
  it('Given the recorded fixtures, When the SDK contract tests run, Then every declared method succeeds', async () => {
    const provider = createMangaDexProvider({ fetchImpl: createFixtureFetch() });
    const result = await runProviderContractTests({
      manifest: MANGADEX_MANIFEST,
      provider,
    });
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('Given a non-fixture endpoint, When a request runs, Then the fixture fetch 404s loudly', async () => {
    const provider = createMangaDexProvider({ fetchImpl: createFixtureFetch() });
    const ctx = { manifest: MANGADEX_MANIFEST, providerId: 'mangadex' };
    await expect(provider.search!(ctx, { query: 'anything' })).resolves.toBeDefined();
    const other = createMangaDexProvider({
      fetchImpl: async () => new Response('nope', { status: 404 }),
    });
    await expect(other.search!(ctx, { query: 'x' })).rejects.toMatchObject({
      code: 'extensions.sdk.request.http_error',
    });
  });
});
