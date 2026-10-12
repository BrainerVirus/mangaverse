import { isSafeExternalUrl } from './url-protocol.js';
import type { NetworkFetchResult } from './network-fetch.js';

/** Fetch remote bytes from the Electron main process (bypasses renderer CSP). */
export async function fetchMainProcessBytes(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
): Promise<NetworkFetchResult | undefined> {
  if (!isSafeExternalUrl(url)) {
    return undefined;
  }

  try {
    const response = await fetchImpl(url, { referrerPolicy: 'no-referrer' });
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
  }
}
