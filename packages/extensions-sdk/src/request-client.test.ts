import { describe, expect, it, vi } from 'vitest';

import { createRequestGate } from './request-gate';
import { createProviderRequestClient } from './request-client';

describe('createProviderRequestClient', () => {
  it('returns ok for successful response', async () => {
    const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    const client = createProviderRequestClient({ fetchImpl });
    const res = await client.request({ url: 'https://example.com/x' });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error('expected res.ok to be true');
    }
    expect(res.value.bodyText).toBe('{}');
  });

  it('maps HTTP errors to err', async () => {
    const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response('', { status: 500 }),
    );
    const client = createProviderRequestClient({ fetchImpl });
    const res = await client.request({ url: 'https://example.com/x' });
    expect(res.ok).toBe(false);
  });

  it('does not put request headers on normalized fetch errors', async () => {
    const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => {
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
    if (res.ok) {
      throw new Error('expected res.ok to be false');
    }
    expect(JSON.stringify(res.error)).not.toContain('secret');
    expect(JSON.stringify(res.error)).not.toContain('abc');
    expect(res.error.details?.url).toBe('https://example.com/data');
  });

  it('respects abort signal', async () => {
    const fetchImpl = vi.fn<
      (_url: string | URL | Request, init?: RequestInit) => Promise<Response>
    >((_url, init) => {
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
    const fetchImpl = vi.fn<
      (_url: string | URL | Request, init?: RequestInit) => Promise<Response>
    >((_url, init) => {
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
    if (res.ok) {
      throw new Error('expected res.ok to be false');
    }
    expect(res.error.code).toBe('extensions.sdk.request.timeout');
  });

  it('Given a zero rate override, When requesting, Then the gate rejects before fetching', async () => {
    let nowMs = 0;
    const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    const gate = createRequestGate({
      defaultRequestsPerMinute: 40,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
    });
    const client = createProviderRequestClient({ fetchImpl, gate });

    const res = await client.request({ url: 'https://example.com/x', requestsPerMinute: 0 });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected res.ok to be false');
    expect(res.error.code).toBe('extensions.sdk.ratelimit.blocked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('Given a 429, Then the gate records Retry-After and the error carries retryAfterMs', async () => {
    let nowMs = 1_000;
    const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response('', { status: 429, headers: { 'retry-after': '2' } }),
    );
    const gate = createRequestGate({
      defaultRequestsPerMinute: 40,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
    });
    const client = createProviderRequestClient({ fetchImpl, gate });

    const res = await client.request({ url: 'https://example.com/x', requestsPerMinute: 40 });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected res.ok to be false');
    expect(res.error.code).toBe('extensions.sdk.request.http_error');
    expect(res.error.details).toEqual({ status: 429, retryAfterMs: 2_000 });
    expect(gate.blockedUntilMs()).toBe(3_000);
  });

  it('Given a 429 without Retry-After, Then the error carries the fallback minute', async () => {
    const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response('', { status: 429 }),
    );
    const gate = createRequestGate({ defaultRequestsPerMinute: 40, now: () => 0 });
    const client = createProviderRequestClient({ fetchImpl, gate });

    const res = await client.request({ url: 'https://example.com/x' });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected res.ok to be false');
    expect(res.error.details).toEqual({ status: 429, retryAfterMs: 60_000 });
  });

  it('Given a long park and a short response timeout, Then the gate wait is not charged to the response', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchImpl = vi.fn<
        (_url: string | URL | Request, init?: RequestInit) => Promise<Response>
      >(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('timeout'));
            });
          }),
      );
      const gate = createRequestGate({ defaultRequestsPerMinute: 40 });
      gate.noteResponse(429, { 'retry-after': '60' });
      const client = createProviderRequestClient({ fetchImpl, gate, defaultTimeoutMs: 20 });

      const pending = client.request({ url: 'https://example.com/x' });
      // The 60 s park outlives the 20 ms response timeout; a timeout that started
      // before the gate would abort the call here and never reach the fetch.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(25);
      const res = await pending;

      expect(res.ok).toBe(false);
      if (res.ok) throw new Error('expected res.ok to be false');
      expect(res.error.code).toBe('extensions.sdk.request.timeout');
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Given an abort while the gate is parked, Then the error carries the remaining wait', async () => {
    const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    const gate = createRequestGate({ defaultRequestsPerMinute: 40 });
    gate.noteResponse(429, { 'retry-after': '60' });
    const client = createProviderRequestClient({ fetchImpl, gate });
    const controller = new AbortController();

    const pending = client.request({ url: 'https://example.com/x', signal: controller.signal });
    controller.abort();
    const res = await pending;

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected res.ok to be false');
    expect(res.error.code).toBe('extensions.sdk.ratelimit.blocked');
    expect(res.error.details?.aborted).toBe(true);
    const remaining = res.error.details?.retryAfterMs;
    expect(typeof remaining).toBe('number');
    expect(remaining).toBeGreaterThan(50_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('Given an already-aborted signal, Then the request aborts before the fetch settles', async () => {
    const fetchImpl = vi.fn<
      (_url: string | URL | Request, init?: RequestInit) => Promise<Response>
    >((_url, init) => {
      if (init?.signal?.aborted === true) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const client = createProviderRequestClient({ fetchImpl });
    const controller = new AbortController();
    controller.abort();

    const res = await client.request({
      url: 'https://example.com/x',
      signal: controller.signal,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected res.ok to be false');
    expect(res.error.code).toBe('extensions.sdk.request.aborted');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
