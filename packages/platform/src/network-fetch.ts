import { isSafeExternalUrl } from './url-protocol.js';

export interface NetworkFetchResult {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
}

/**
 * Bound one image/byte download. A stalled socket otherwise pins the reader's
 * four prefetch workers and leaves a cover placeholder pulsing forever.
 * Matches the Electron main-process hop bound.
 */
export const NETWORK_FETCH_TIMEOUT_MS = 30_000;

export async function fetchNetworkBytes(url: string): Promise<NetworkFetchResult | undefined> {
  if (!isSafeExternalUrl(url)) {
    return undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
    const data = await response.arrayBuffer();
    if (data.byteLength === 0) {
      return undefined;
    }
    return { data, mimeType };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
