import { isSafeExternalUrl } from './url-protocol.js';
import type { NetworkFetchResult } from './network-fetch.js';

const MAX_REDIRECTS = 10;

/**
 * Fetch remote bytes from the Electron main process (bypasses renderer CSP).
 * `isAllowedUrl` runs on the first URL and on every redirect target, so a public
 * URL cannot bounce the fetch to a loopback or private host.
 */
export async function fetchMainProcessBytes(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  isAllowedUrl: (url: string) => Promise<boolean> = async (candidate) =>
    isSafeExternalUrl(candidate),
): Promise<NetworkFetchResult | undefined> {
  let target = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!(await isAllowedUrl(target))) {
      return undefined;
    }
    try {
      const response = await fetchImpl(target, {
        referrerPolicy: 'no-referrer',
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location === null) {
          return undefined;
        }
        target = new URL(location, target).toString();
        continue;
      }
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
  return undefined;
}
