import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNetworkBytes, NETWORK_FETCH_TIMEOUT_MS } from './network-fetch.js';

const originalFetch = globalThis.fetch;
const url = 'https://uploads.example.com/page.jpg';

describe('fetchNetworkBytes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('returns the bytes and content type for a successful response', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      });
    });

    const result = await fetchNetworkBytes(url);

    expect(result?.mimeType).toBe('image/jpeg');
    expect(result?.data.byteLength).toBe(3);
  });

  it('gives up on a stalled request instead of pinning the caller', async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = vi.fn<typeof fetch>((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const pending = fetchNetworkBytes(url);
    await vi.advanceTimersByTimeAsync(NETWORK_FETCH_TIMEOUT_MS);

    await expect(pending).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
  });

  it('rejects unsafe urls without a request', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    globalThis.fetch = fetchSpy;

    await expect(fetchNetworkBytes('file:///etc/passwd')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
