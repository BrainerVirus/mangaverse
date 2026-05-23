import { describe, expect, it, vi } from 'vitest';

import { createProviderRequestClient } from './request-client';

describe('createProviderRequestClient', () => {
  it('returns ok for successful response', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = createProviderRequestClient({ fetchImpl });
    const res = await client.request({ url: 'https://example.com/x' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.bodyText).toBe('{}');
  });

  it('maps HTTP errors to err', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const client = createProviderRequestClient({ fetchImpl });
    const res = await client.request({ url: 'https://example.com/x' });
    expect(res.ok).toBe(false);
  });

  it('does not put request headers on normalized fetch errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const client = createProviderRequestClient({
      fetchImpl,
      defaultHeaders: { authorization: 'Bearer secret' },
    });
    const res = await client.request({
      url: 'https://example.com/data?token=secret#h',
      headers: { 'x-api-key': 'abc' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(JSON.stringify(res.error)).not.toContain('secret');
      expect(JSON.stringify(res.error)).not.toContain('abc');
      expect(res.error.details?.url).toBe('https://example.com/data');
    }
  });

  it('respects abort signal', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal;
        if (!sig) {
          reject(new Error('no signal'));
          return;
        }
        if (sig.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        sig.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    const client = createProviderRequestClient({ fetchImpl, defaultTimeoutMs: 5000 });
    const controller = new AbortController();
    const p = client.request({ url: 'https://example.com/x', signal: controller.signal });
    controller.abort();
    const res = await p;
    expect(res.ok).toBe(false);
  });

  it('times out slow responses', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        const sig = init?.signal;
        const timer = setTimeout(() => resolve(new Response('ok', { status: 200 })), 10_000);
        sig?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('timeout'));
        });
      });
    });
    const client = createProviderRequestClient({ fetchImpl, defaultTimeoutMs: 30 });
    const res = await client.request({ url: 'https://example.com/x' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('extensions.sdk.request.timeout');
  });
});
