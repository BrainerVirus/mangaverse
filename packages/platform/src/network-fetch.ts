import { isSafeExternalUrl } from './url-protocol.js';

export interface NetworkFetchResult {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
}

export interface NetworkFetchOptions {
  /** Injected for tests; defaults to the page's own `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /**
   * The browser follows redirects itself, so the URL that answered is checked
   * before any bytes are read. `false` refuses the response.
   */
  readonly isFinalUrlAllowed?: (url: string) => boolean;
  /** Called with the refused final URL; no bytes are read from it. */
  readonly onRefused?: (url: string) => void;
}

/**
 * Bound one image/byte download. A stalled socket otherwise pins the reader's
 * four prefetch workers and leaves a cover placeholder pulsing forever.
 * Matches the Electron main-process hop bound.
 */
export const NETWORK_FETCH_TIMEOUT_MS = 30_000;

export async function fetchNetworkBytes(
  url: string,
  options: NetworkFetchOptions = {},
): Promise<NetworkFetchResult | undefined> {
  if (!isSafeExternalUrl(url)) {
    return undefined;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }
    if (
      response.url !== '' &&
      options.isFinalUrlAllowed !== undefined &&
      !options.isFinalUrlAllowed(response.url)
    ) {
      options.onRefused?.(response.url);
      // Do not let a refused hop keep streaming its body behind this call.
      if (response.body !== null) {
        await response.body.cancel().catch(() => undefined);
      }
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
