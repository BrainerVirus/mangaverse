import { isSafeExternalUrl } from './url-protocol.js';

export interface NetworkFetchResult {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
}

export async function fetchNetworkBytes(url: string): Promise<NetworkFetchResult | undefined> {
  if (!isSafeExternalUrl(url)) {
    return undefined;
  }

  try {
    const response = await fetch(url, { referrerPolicy: 'no-referrer' });
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
