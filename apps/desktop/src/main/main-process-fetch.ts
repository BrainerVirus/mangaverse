import type { ClientRequest, ClientRequestConstructorOptions, IncomingMessage } from 'electron';
import type { NetworkFetchResult } from '@app/platform';

const MAX_REDIRECTS = 5;
/** Cap one download so a hostile host cannot exhaust main-process memory. */
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
/** Bound one hop so a silent socket cannot leave the IPC handler pending forever. */
const HOP_TIMEOUT_MS = 30_000;

type RequestFactory = (options: ClientRequestConstructorOptions) => ClientRequest;

type HopOutcome =
  | { readonly redirectUrl: string }
  | { readonly result: NetworkFetchResult }
  | undefined;

function firstHeader(headers: Record<string, string | string[]>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * One request that never follows redirects automatically. Electron requires
 * `followRedirect()` synchronously during the `redirect` event, but SSRF checks
 * are async, so the redirect target is returned and validated before the next
 * hop is requested.
 */
function requestHop(request: RequestFactory, url: string): Promise<HopOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (outcome: HopOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    timer = setTimeout(() => finish(undefined), HOP_TIMEOUT_MS);

    let req: ClientRequest;
    try {
      req = request({
        url,
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        useSessionCookies: false,
        referrerPolicy: 'no-referrer',
      });
    } catch {
      finish(undefined);
      return;
    }

    req.on('redirect', (_statusCode, _method, nextUrl) => {
      // Do not call followRedirect(): the next hop needs async validation.
      finish({ redirectUrl: nextUrl });
    });

    req.on('response', (response: IncomingMessage) => {
      const status = response.statusCode;
      if (status >= 300 && status < 400) {
        const location = firstHeader(response.headers, 'location');
        finish(location === undefined ? undefined : { redirectUrl: location });
        req.abort();
        return;
      }
      if (status < 200 || status >= 300) {
        finish(undefined);
        req.abort();
        return;
      }

      const mimeType = firstHeader(response.headers, 'content-type') ?? 'application/octet-stream';
      const chunks: Buffer[] = [];
      let bytes = 0;

      response.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          finish(undefined);
          req.abort();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (bytes === 0) {
          finish(undefined);
          return;
        }
        const merged = Buffer.concat(chunks, bytes);
        finish({
          result: {
            data: merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength),
            mimeType,
          },
        });
      });
      response.on('error', () => finish(undefined));
      response.on('aborted', () => finish(undefined));
    });

    req.on('error', () => finish(undefined));
    // Electron 44 emits finish and close right after end(), before
    // response/redirect, so close is not a settlement signal; the timeout bounds it.
    try {
      req.end();
    } catch {
      finish(undefined);
    }
  });
}

/**
 * Fetch remote bytes from the Electron main process (bypasses renderer CSP).
 * `isAllowedUrl` runs before every hop, including each redirect target, so a
 * public URL cannot bounce the fetch to a loopback or private host.
 *
 * shortcut: DNS is resolved for validation and then again by Chromium, so a
 * fast rebind can still race the request; pin the address when Electron
 * exposes a hook.
 */
export async function fetchMainProcessBytes(
  request: RequestFactory,
  url: string,
  isAllowedUrl: (url: string) => Promise<boolean>,
): Promise<NetworkFetchResult | undefined> {
  let target = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!(await isAllowedUrl(target))) {
      return undefined;
    }
    const hop = await requestHop(request, target);
    if (hop === undefined) {
      return undefined;
    }
    if ('result' in hop) {
      return hop.result;
    }
    try {
      target = new URL(hop.redirectUrl, target).toString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}
