import { isSafeExternalUrl } from './url-protocol.js';

export interface NetworkFetchResult {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
}

export interface NetworkFetchOptions {
  /** Injected for tests; defaults to the page's own `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /**
   * When set, redirects are followed here rather than by the browser, and every
   * redirect target is checked before it is requested. `false` refuses the hop.
   */
  readonly isUrlAllowed?: (url: string) => boolean;
  /**
   * Called with the refused redirect target, or `undefined` when the browser hid
   * the redirect; no request is made to it and no bytes are read.
   */
  readonly onRefused?: (url: string | undefined) => void;
}

/** Same bound as the Electron main process: at most this many redirect hops. */
export const MAX_REDIRECT_HOPS = 5;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

export type CheckedRedirectOutcome =
  | { readonly kind: 'response'; readonly response: Response; readonly url: string }
  | {
      readonly kind: 'refused';
      /** The target that was refused; `undefined` for a redirect the browser hid. */
      readonly url: string | undefined;
    };

async function discardBody(response: Response): Promise<void> {
  if (response.body !== null) {
    await response.body.cancel().catch(() => undefined);
  }
}

/**
 * Fetch `url` and follow redirects by hand with `redirect: 'manual'`, so each
 * target is checked against `isUrlAllowed` before it is requested. `url` itself
 * is the caller's to check. `fetch` with the default `follow` would contact an
 * undeclared intermediate host before the final URL could be inspected.
 *
 * A browser hides a manual redirect (an opaque redirect, status 0, no readable
 * `Location`), so it cannot be checked and is refused. A provider whose requests
 * need a cross-origin redirect is therefore unsupported on web; Electron's main
 * process reads every hop and is unaffected.
 */
export async function fetchWithCheckedRedirects(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  isUrlAllowed: (url: string) => boolean,
): Promise<CheckedRedirectOutcome> {
  const { method: initialMethod, body: initialBody, headers: initialHeaders, ...fixed } = init;
  let current = url;
  let method = initialMethod ?? 'GET';
  let body = initialBody;
  let headers = initialHeaders;

  for (let hop = 0; ; hop += 1) {
    const response = await fetchImpl(current, {
      ...fixed,
      method,
      ...(body === undefined || body === null ? {} : { body }),
      ...(headers === undefined ? {} : { headers }),
      redirect: 'manual',
    });
    if (response.type === 'opaqueredirect' || response.status === 0) {
      await discardBody(response);
      return { kind: 'refused', url: undefined };
    }
    const location = REDIRECT_STATUSES.has(response.status)
      ? response.headers.get('location')
      : null;
    if (location === null) {
      return { kind: 'response', response, url: current };
    }
    await discardBody(response);

    if (!URL.canParse(location, current)) {
      return { kind: 'refused', url: location };
    }
    const next = new URL(location, current);
    if (hop >= MAX_REDIRECT_HOPS || !isUrlAllowed(next.href)) {
      return { kind: 'refused', url: next.href };
    }

    // The browser's own redirect rules: 303 (and a POST after 301/302) becomes a
    // body-less GET, and credentials do not cross to another origin.
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === 'POST')
    ) {
      method = method === 'HEAD' ? 'HEAD' : 'GET';
      body = undefined;
    }
    if (next.origin !== new URL(current).origin && headers !== undefined) {
      const stripped = new Headers(headers);
      stripped.delete('authorization');
      stripped.delete('proxy-authorization');
      stripped.delete('cookie');
      headers = stripped;
    }
    current = next.href;
  }
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
    const init: RequestInit = { referrerPolicy: 'no-referrer', signal: controller.signal };
    let response: Response;
    if (options.isUrlAllowed === undefined) {
      response = await fetchImpl(url, init);
    } else {
      const outcome = await fetchWithCheckedRedirects(fetchImpl, url, init, options.isUrlAllowed);
      if (outcome.kind === 'refused') {
        options.onRefused?.(outcome.url);
        return undefined;
      }
      response = outcome.response;
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
  } finally {
    clearTimeout(timer);
  }
}
