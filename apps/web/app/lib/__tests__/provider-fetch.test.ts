import { describe, expect, it, vi } from 'vitest';
import { ok, err, createAppError } from '@app/shared';

const { request, fetchBytes } = vi.hoisted(() => ({
  request: vi.fn<(...args: unknown[]) => unknown>(),
  fetchBytes: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('../../features/diagnostics/create-app-platform-adapter.js', () => ({
  createAppPlatformAdapter: () => ({
    providerNetwork: { request },
    network: { fetchBytes },
  }),
}));

import { createProviderFetch, createUserInitiatedFetch } from '../provider-fetch.js';

describe('createProviderFetch', () => {
  it('turns a provider request into IPC and adapts the reply to a Response', async () => {
    request.mockResolvedValue(
      ok({
        status: 200,
        headers: { 'content-type': 'application/json' },
        bodyText: '{"data":[]}',
        finalUrl: 'https://api.mangadex.org/manga',
      }),
    );
    const providerFetch = createProviderFetch('mangadex');

    const response = await providerFetch('https://api.mangadex.org/manga?limit=1', {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: '{"q":"x"}',
    });

    expect(request).toHaveBeenCalledWith({
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/manga?limit=1',
      method: 'POST',
      headers: { accept: 'application/json' },
      body: '{"q":"x"}',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('{"data":[]}');
  });

  it('keeps a non-2xx status as a normal Response so the SDK decides', async () => {
    request.mockResolvedValue(
      ok({ status: 404, headers: {}, bodyText: 'nope', finalUrl: 'https://api.mangadex.org/x' }),
    );

    const response = await createProviderFetch('mangadex')('https://api.mangadex.org/x');

    expect(response.status).toBe(404);
    expect(response.ok).toBe(false);
  });

  it('throws a typed failure and honours an aborted signal', async () => {
    request.mockResolvedValue(
      err(
        createAppError({
          code: 'platform.invalid-url',
          message: 'Provider may not reach this host.',
        }),
      ),
    );
    const providerFetch = createProviderFetch('mangadex');

    await expect(providerFetch('https://evil.example/')).rejects.toThrow(
      'Provider may not reach this host.',
    );

    const controller = new AbortController();
    controller.abort();
    await expect(
      providerFetch('https://api.mangadex.org/x', { signal: controller.signal }),
    ).rejects.toThrow(/aborted/i);
  });
});

describe('createUserInitiatedFetch', () => {
  it('fetches manifest bytes through the platform and returns a Response', async () => {
    fetchBytes.mockResolvedValue(
      ok({ data: new TextEncoder().encode('{"id":"x"}').buffer, mimeType: 'application/json' }),
    );

    const response = await createUserInitiatedFetch()('https://registry.example/doc.json');

    expect(fetchBytes).toHaveBeenCalledWith('https://registry.example/doc.json');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('{"id":"x"}');
  });

  it('throws when the platform refuses or returns no bytes', async () => {
    fetchBytes.mockResolvedValue(ok(undefined));
    await expect(createUserInitiatedFetch()('https://registry.example/doc.json')).rejects.toThrow(
      'Could not fetch',
    );
  });
});
