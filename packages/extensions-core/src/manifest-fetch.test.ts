import { describe, expect, it, vi } from 'vitest';

import { fetchAndValidateManifestFromUrl, fetchManifestFromUrl } from './manifest-fetch';

const validJson = {
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

describe('fetchManifestFromUrl', () => {
  it('rejects javascript content-type', async () => {
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/javascript' } }),
    );
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected failure with code extensions.core.fetch.code_response');
    }
    expect(r.error.code).toBe('extensions.core.fetch.code_response');
  });

  it('rejects ecmascript content-type', async () => {
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'text/ecmascript' } }),
    );
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected failure with code extensions.core.fetch.code_response');
    }
    expect(r.error.code).toBe('extensions.core.fetch.code_response');
  });

  it('returns json body', async () => {
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(JSON.stringify({ a: 1 }), { status: 200 }),
    );
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error('expected success');
    }
    expect(r.value.json).toEqual({ a: 1 });
  });

  it('rejects invalid JSON', async () => {
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response('not valid json', { status: 200 }),
    );
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected failure with code extensions.core.fetch.invalid_json');
    }
    expect(r.error.code).toBe('extensions.core.fetch.invalid_json');
  });

  it('rejects oversized body exceeding default 256000 bytes', async () => {
    const largeBody = 'x'.repeat(256_001);
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(largeBody, { status: 200 }),
    );
    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected failure with code extensions.core.fetch.body_too_large');
    }
    expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });

  it('rejects oversized body exceeding custom maxManifestBytes', async () => {
    const body = 'x'.repeat(101);
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(body, { status: 200 }),
    );
    const r = await fetchManifestFromUrl('https://example.com/m.json', {
      fetch,
      maxManifestBytes: 100,
    });
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected failure with code extensions.core.fetch.body_too_large');
    }
    expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });

  it('rejects body by UTF-8 byte length, not string length', async () => {
    const body = JSON.stringify({ value: 'é'.repeat(60) });
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(body, { status: 200 }),
    );

    const r = await fetchManifestFromUrl('https://example.com/m.json', {
      fetch,
      maxManifestBytes: 100,
    });

    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected failure with code extensions.core.fetch.body_too_large');
    }
    expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });

  it('accepts body within custom maxManifestBytes', async () => {
    const body = JSON.stringify({ ok: true });
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(body, { status: 200 }),
    );
    const r = await fetchManifestFromUrl('https://example.com/m.json', {
      fetch,
      maxManifestBytes: 100,
    });
    expect(r.ok).toBe(true);
  });

  it('stores raw text for checksum verification', async () => {
    const originalText = JSON.stringify({ checksum: 'test' });
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(originalText, { status: 200 }),
    );

    const r = await fetchManifestFromUrl('https://example.com/m.json', { fetch });

    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error('expected success');
    }
    expect(r.value.rawText).toBe(originalText);
    expect(r.value.json).toEqual({ checksum: 'test' });
  });

  it('reports a cancelled fetch when the caller aborts', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      (_input: unknown, init?: unknown) =>
        new Promise<Response>((_resolve, reject) => {
          (init as RequestInit | undefined)?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const pending = fetchManifestFromUrl('https://example.com/m.json', {
      fetch,
      signal: controller.signal,
    });
    controller.abort();
    const r = await pending;

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected failure');
    expect(r.error.code).toBe('extensions.core.fetch.aborted');
  });

  it('aborts a request that exceeds the configured timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
        (_input: unknown, init?: unknown) =>
          new Promise<Response>((_resolve, reject) => {
            (init as RequestInit | undefined)?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );

      const pending = fetchManifestFromUrl('https://example.com/m.json', {
        fetch,
        timeoutMs: 50,
      });
      await vi.advanceTimersByTimeAsync(50);
      const r = await pending;

      expect(r.ok).toBe(false);
      if (r.ok) throw new Error('expected failure');
      expect(r.error.code).toBe('extensions.core.fetch.timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchAndValidateManifestFromUrl', () => {
  it('validates manifest', async () => {
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(JSON.stringify(validJson), { status: 200 }),
    );
    const r = await fetchAndValidateManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error('expected success');
    }
    expect(r.value.name).toBe('Demo Provider');
  });

  it('rejects oversized body', async () => {
    const largeBody = 'x'.repeat(256_001);
    const fetch = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
      async () => new Response(largeBody, { status: 200 }),
    );
    const r = await fetchAndValidateManifestFromUrl('https://example.com/m.json', { fetch });
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected failure with code extensions.core.fetch.body_too_large');
    }
    expect(r.error.code).toBe('extensions.core.fetch.body_too_large');
  });
});
