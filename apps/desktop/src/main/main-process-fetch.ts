import type { ClientRequest, ClientRequestConstructorOptions, IncomingMessage } from 'electron';
import type { NetworkFetchResult } from '@app/platform';

const MAX_REDIRECTS = 5;
/**
 * Cap one buffered body so a hostile host cannot exhaust main-process memory.
 * Redirect and error responses are aborted before their body is read, so only
 * one body is ever buffered: this per-response cap is also the aggregate cap.
 */
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
/** Bound one hop so a silent socket cannot leave the IPC handler pending forever. */
const HOP_TIMEOUT_MS = 30_000;
/** Bound the redirect chain; six hops at HOP_TIMEOUT_MS could otherwise run 3 minutes. */
const REQUEST_TIMEOUT_MS = 60_000;

type RequestFactory = (options: ClientRequestConstructorOptions) => ClientRequest;

type CancellableRequest = ClientRequest & { destroy?: () => void };

type HopOutcome =
  | { readonly redirectUrl: string }
  | { readonly result: NetworkFetchResult }
  | undefined;

function firstHeader(headers: Record<string, string | string[]>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Close the socket, not just the promise: a timed-out hop must not keep reading. */
function cancelRequest(req: ClientRequest): void {
  try {
    req.abort();
  } catch {
    // Already closed.
  }
  try {
    // Electron's ClientRequest types expose only abort(); destroy releases the
    // socket on implementations that provide it.
    (req as CancellableRequest).destroy?.();
  } catch {
    // Already closed.
  }
}

/**
 * One request that never follows redirects automatically. Electron requires
 * `followRedirect()` synchronously during the `redirect` event, but SSRF checks
 * are async, so the redirect target is returned and validated before the next
 * hop is requested.
 */
function requestHop(request: RequestFactory, url: string, timeoutMs: number): Promise<HopOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (outcome: HopOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    timer = setTimeout(() => {
      // Abort before settling so the caller resuming cannot leave the socket open.
      cancelRequest(req);
      finish(undefined);
    }, timeoutMs);

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
        cancelRequest(req);
        return;
      }
      if (status < 200 || status >= 300) {
        finish(undefined);
        cancelRequest(req);
        return;
      }

      const mimeType = firstHeader(response.headers, 'content-type') ?? 'application/octet-stream';
      const chunks: Buffer[] = [];
      let bytes = 0;

      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        bytes += chunk.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          finish(undefined);
          cancelRequest(req);
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
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
 * exposes a hook. A lookup that never resolves also outlives the deadline
 * because it has no abort signal; race it when the resolver gains one.
 */
export async function fetchMainProcessBytes(
  request: RequestFactory,
  url: string,
  isAllowedUrl: (url: string) => Promise<boolean>,
): Promise<NetworkFetchResult | undefined> {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  let target = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!(await isAllowedUrl(target))) {
      return undefined;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    const hop = await requestHop(request, target, Math.min(HOP_TIMEOUT_MS, remaining));
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
