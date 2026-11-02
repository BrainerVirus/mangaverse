import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { isBlockedIpAddress, isBlockedNetworkHost } from '@app/platform';
import type { NetworkFetchResult } from '@app/platform';

export const MAX_REDIRECTS = 5;
/**
 * Cap one buffered body so a hostile host cannot exhaust main-process memory.
 * Redirect and error responses are aborted before their body is read, so only
 * one body is ever buffered: this per-response cap is also the aggregate cap.
 */
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
/** Bound one hop so a silent socket cannot leave the IPC handler pending forever. */
export const HOP_TIMEOUT_MS = 30_000;
/** Bound validation plus the redirect chain; six hops alone could run 3 minutes. */
export const REQUEST_TIMEOUT_MS = 60_000;

export type NetworkFailureCode =
  | 'network.invalid-url'
  | 'network.blocked-url'
  | 'network.blocked-address'
  | 'network.dns-failed'
  | 'network.redirect-limit'
  | 'network.body-too-large'
  | 'network.timeout'
  | 'network.empty-body'
  | 'network.http-status'
  | 'network.transport-error';

/** A refusal or limit breach, carrying enough detail for main's log and a typed IPC error. */
export class NetworkFetchError extends Error {
  readonly code: NetworkFailureCode;
  readonly url: string | undefined;
  readonly address: string | undefined;

  constructor(
    code: NetworkFailureCode,
    message: string,
    options: { readonly url?: string; readonly address?: string } = {},
  ) {
    super(message);
    this.name = 'NetworkFetchError';
    this.code = code;
    this.url = options.url;
    this.address = options.address;
  }
}

export interface NetworkRefusalEvent {
  readonly code: NetworkFailureCode;
  readonly url?: string;
  readonly address?: string;
}

/** One pinned connection attempt: the address was validated immediately before use. */
export interface HopRequest {
  readonly url: URL;
  readonly address: string;
  readonly family: 4 | 6;
  /** Absolute epoch millisecond deadline for this hop. */
  readonly deadline: number;
}

export type HopReply =
  | {
      readonly kind: 'response';
      readonly status: number;
      readonly headers: Readonly<Record<string, string | string[]>>;
      readonly body: Buffer;
      readonly finalUrl: string;
    }
  | { readonly kind: 'redirect'; readonly location: string };

export type RequestHop = (request: HopRequest) => Promise<HopReply>;

export interface NetworkTransportDeps {
  /** Resolves every address of a hostname so all of them can be checked before connecting. */
  readonly resolveHostAddresses: (hostname: string) => Promise<readonly string[]>;
  /** Injectable for tests; production uses Node's http/https with a pinned lookup. */
  readonly requestHop?: RequestHop;
  readonly log?: (event: NetworkRefusalEvent) => void;
}

export interface NetworkResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[]>>;
  readonly body: Buffer;
  readonly finalUrl: string;
}

/**
 * Resolve `work` by the absolute `deadline`, or `undefined` once it passes.
 * A lookup has no abort hook, so a hung one is abandoned; the attached rejection
 * handler keeps a late failure from becoming an unhandled rejection.
 */
export function settleByDeadline<T>(work: Promise<T>, deadline: number): Promise<T | undefined> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    void work.catch(() => undefined);
    return Promise.resolve(undefined);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), remaining);
  });
  return Promise.race([work.catch(() => undefined), expired]).finally(() => clearTimeout(timer));
}

/** Like `settleByDeadline`, but a failing `work` rejects instead of looking like a timeout. */
function raceDeadline<T>(work: Promise<T>, deadline: number): Promise<T | undefined> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    void work.catch(() => undefined);
    return Promise.resolve(undefined);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), remaining);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

function firstHeader(
  headers: Readonly<Record<string, string | string[]>>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) out[name.toLowerCase()] = value;
  }
  return out;
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

/** Parses an http(s) URL with no embedded credentials; anything else is refused. */
export function parseHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (url.username.length > 0 || url.password.length > 0) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/**
 * Every resolved address must be public. A host that answers with one private
 * address is refused even if another answer looks public: the client could
 * otherwise pick the bad one.
 */
async function resolvePinnedAddress(
  url: URL,
  deps: NetworkTransportDeps,
  deadline: number,
): Promise<{ readonly address: string; readonly family: 4 | 6 }> {
  const hostname = hostnameOf(url);
  if (isBlockedNetworkHost(hostname)) {
    throw new NetworkFetchError('network.blocked-url', 'Network host is not public.', {
      url: url.toString(),
    });
  }

  const addresses = await settleByDeadline(deps.resolveHostAddresses(hostname), deadline);
  if (addresses === undefined) {
    throw new NetworkFetchError('network.timeout', 'DNS lookup timed out.', {
      url: url.toString(),
    });
  }
  if (addresses.length === 0) {
    throw new NetworkFetchError('network.dns-failed', 'DNS lookup returned no address.', {
      url: url.toString(),
    });
  }

  for (const address of addresses) {
    const family = isIP(address);
    if (family === 0) {
      throw new NetworkFetchError('network.dns-failed', 'DNS lookup returned an invalid address.', {
        url: url.toString(),
      });
    }
    if (isBlockedIpAddress(address)) {
      throw new NetworkFetchError('network.blocked-address', 'Network address is not public.', {
        url: url.toString(),
        address,
      });
    }
  }

  const address = addresses[0]!;
  return { address, family: isIP(address) === 6 ? 6 : 4 };
}

/**
 * One connection to a validated address. The URL's hostname stays in the
 * request (Host header, TLS SNI and certificate checks) while `lookup` returns
 * only the address checked a moment ago, so a second DNS answer cannot redirect
 * the socket. A fresh socket per hop (`agent: false`) keeps a pooled keep-alive
 * connection from outliving the address check.
 */
export const nodeRequestHop: RequestHop = (hop) =>
  new Promise<HopReply>((resolve, reject) => {
    const remaining = hop.deadline - Date.now();
    if (remaining <= 0) {
      reject(
        new NetworkFetchError('network.timeout', 'Network request timed out.', {
          url: hop.url.toString(),
        }),
      );
      return;
    }
    const hopTimeout = Math.min(HOP_TIMEOUT_MS, remaining);
    const isHttps = hop.url.protocol === 'https:';
    const hostname = hostnameOf(hop.url);

    const lookup = ((
      _hostname: string,
      options: { readonly all?: boolean },
      callback: (
        error: NodeJS.ErrnoException | null,
        address: string | { address: string; family: number }[],
        family?: number,
      ) => void,
    ) => {
      if (options.all === true) {
        callback(null, [{ address: hop.address, family: hop.family }]);
        return;
      }
      callback(null, hop.address, hop.family);
    }) as never;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (reply: HopReply): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(reply);
    };
    const fail = (error: NetworkFetchError): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      reject(error);
    };

    const requestFn: typeof httpsRequest = isHttps
      ? httpsRequest
      : (httpRequest as unknown as typeof httpsRequest);
    const req = requestFn(
      hop.url,
      {
        method: 'GET',
        headers: {
          accept: '*/*',
          'accept-encoding': 'identity',
          host: hop.url.host,
        },
        lookup: lookup as never,
        family: hop.family,
        agent: false,
        ...(isHttps ? { servername: hostname } : {}),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const headers = normalizeHeaders(response.headers);
        if (status >= 300 && status < 400) {
          const location = firstHeader(headers, 'location');
          response.resume();
          if (location === undefined) {
            finish({
              kind: 'response',
              status,
              headers,
              body: Buffer.alloc(0),
              finalUrl: hop.url.toString(),
            });
            return;
          }
          finish({ kind: 'redirect', location });
          return;
        }

        const declared = Number(firstHeader(headers, 'content-length') ?? Number.NaN);
        if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
          req.destroy();
          fail(
            new NetworkFetchError('network.body-too-large', 'Network response is too large.', {
              url: hop.url.toString(),
            }),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          if (settled) return;
          bytes += chunk.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) {
            req.destroy();
            fail(
              new NetworkFetchError('network.body-too-large', 'Network response is too large.', {
                url: hop.url.toString(),
              }),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          finish({
            kind: 'response',
            status,
            headers,
            body: Buffer.concat(chunks, bytes),
            finalUrl: hop.url.toString(),
          });
        });
        response.on('error', () => {
          fail(
            new NetworkFetchError('network.transport-error', 'Network response failed.', {
              url: hop.url.toString(),
            }),
          );
        });
        response.on('aborted', () => {
          fail(
            new NetworkFetchError('network.transport-error', 'Network response was aborted.', {
              url: hop.url.toString(),
            }),
          );
        });
      },
    );

    timer = setTimeout(() => {
      req.destroy();
      fail(
        new NetworkFetchError('network.timeout', 'Network request timed out.', {
          url: hop.url.toString(),
        }),
      );
    }, hopTimeout);

    req.on('error', () => {
      fail(
        new NetworkFetchError('network.transport-error', 'Network request failed.', {
          url: hop.url.toString(),
        }),
      );
    });
    req.end();
  });

function redirectTarget(location: string, base: URL): URL | undefined {
  try {
    return parseHttpUrl(new URL(location, base).toString());
  } catch {
    return undefined;
  }
}

/**
 * Fetch one resource under a caller-supplied URL policy. `isAllowedUrl` runs
 * before every hop, including each redirect target, so a public URL cannot
 * bounce the fetch to a host the caller did not allow. Every hop also resolves
 * and validates the address it connects to.
 */
export async function fetchNetworkResponse(
  url: string,
  isAllowedUrl: (url: string) => Promise<boolean>,
  deps: NetworkTransportDeps,
  deadline = Date.now() + REQUEST_TIMEOUT_MS,
): Promise<NetworkResponse> {
  let target = parseHttpUrl(url);
  if (target === undefined) {
    throw new NetworkFetchError('network.invalid-url', 'Network target is not an http(s) URL.', {
      url,
    });
  }
  const hop = deps.requestHop ?? nodeRequestHop;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const allowed = await settleByDeadline(isAllowedUrl(target.toString()), deadline);
    if (allowed !== true) {
      throw new NetworkFetchError('network.blocked-url', 'Network target is not allowed.', {
        url: target.toString(),
      });
    }
    const pinned = await resolvePinnedAddress(target, deps, deadline);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new NetworkFetchError('network.timeout', 'Network request timed out.', {
        url: target.toString(),
      });
    }

    const reply = await raceDeadline(
      hop({
        url: target,
        address: pinned.address,
        family: pinned.family,
        deadline: Math.min(deadline, Date.now() + Math.min(HOP_TIMEOUT_MS, remaining)),
      }),
      deadline,
    );
    if (reply === undefined) {
      throw new NetworkFetchError('network.timeout', 'Network request timed out.', {
        url: target.toString(),
      });
    }

    if (reply.kind === 'response') {
      if (reply.body.byteLength > MAX_RESPONSE_BYTES) {
        throw new NetworkFetchError('network.body-too-large', 'Network response is too large.', {
          url: reply.finalUrl,
        });
      }
      return {
        status: reply.status,
        headers: reply.headers,
        body: reply.body,
        finalUrl: reply.finalUrl,
      };
    }

    if (redirects === MAX_REDIRECTS) {
      throw new NetworkFetchError('network.redirect-limit', 'Too many redirects.', {
        url: target.toString(),
      });
    }
    const next = redirectTarget(reply.location, target);
    if (next === undefined) {
      throw new NetworkFetchError('network.invalid-url', 'Redirect target is not an http(s) URL.', {
        url: target.toString(),
      });
    }
    target = next;
  }

  throw new NetworkFetchError('network.redirect-limit', 'Too many redirects.', { url });
}

/** A 2xx response with a non-empty body; the shape the page and cover caches need. */
export async function fetchMainProcessBytes(
  url: string,
  isAllowedUrl: (url: string) => Promise<boolean>,
  deps: NetworkTransportDeps,
  deadline = Date.now() + REQUEST_TIMEOUT_MS,
): Promise<NetworkFetchResult> {
  const response = await fetchNetworkResponse(url, isAllowedUrl, deps, deadline);
  if (response.status < 200 || response.status >= 300) {
    throw new NetworkFetchError(
      'network.http-status',
      `Network response was HTTP ${response.status}.`,
      {
        url: response.finalUrl,
      },
    );
  }
  if (response.body.byteLength === 0) {
    throw new NetworkFetchError('network.empty-body', 'Network response had no body.', {
      url: response.finalUrl,
    });
  }
  const data = response.body;
  return {
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    mimeType: firstHeader(response.headers, 'content-type') ?? 'application/octet-stream',
  };
}

/** Runs a transport call and reports every refusal to main's log, then rethrows. */
export async function withRefusalLog<T>(
  deps: NetworkTransportDeps,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NetworkFetchError) {
      deps.log?.({
        code: error.code,
        ...(error.url !== undefined ? { url: error.url } : {}),
        ...(error.address !== undefined ? { address: error.address } : {}),
      });
    }
    throw error;
  }
}
