import type { PlatformProviderRequestMethod } from '@app/platform';

import {
  createAppPlatformAdapter,
  hasDesktopBridge,
} from '../features/diagnostics/create-app-platform-adapter.js';

const METHODS = new Set<PlatformProviderRequestMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
]);

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (headers === undefined) return undefined;
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, name) => {
    record[name] = value;
  });
  return Object.keys(record).length > 0 ? record : undefined;
}

function methodOf(init: RequestInit | undefined): PlatformProviderRequestMethod {
  const value = init?.method?.toUpperCase();
  return value !== undefined && METHODS.has(value as PlatformProviderRequestMethod)
    ? (value as PlatformProviderRequestMethod)
    : 'GET';
}

function bodyOf(init: RequestInit | undefined): string | undefined {
  if (typeof init?.body === 'string') return init.body;
  if (init?.body instanceof URLSearchParams) return init.body.toString();
  return undefined;
}

function abortFailure(signal: AbortSignal | undefined): unknown {
  // The SDK aborts with `Error('timeout')` for its own deadline; keep that
  // reason so the failure normalizes to a timeout instead of a plain abort.
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * The `fetch` a provider package gets on desktop: every call becomes a typed IPC
 * request that main runs under the provider's allowlist, SSRF checks and limits.
 * The returned `Response` carries main's filtered headers and bounded body, so the
 * SDK's request client, per-provider request gate and error normalization are unchanged.
 */
export function createProviderFetch(providerId: string): typeof fetch {
  const adapter = createAppPlatformAdapter();

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const signal = init?.signal;
    if (signal?.aborted === true) {
      throw abortFailure(signal);
    }

    const requestHeaders = headersToRecord(init?.headers);
    const body = bodyOf(init);
    const request = adapter.providerNetwork.request({
      providerId,
      url,
      method: methodOf(init),
      ...(requestHeaders !== undefined ? { headers: requestHeaders } : {}),
      ...(body !== undefined ? { body } : {}),
    });

    const aborted = new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(abortFailure(signal)), { once: true });
    });

    const result = await Promise.race([request, aborted]);
    if (!result.ok) {
      // Main's typed failure (`network.tls`, `network.reset`, …) is already the
      // shape the provider SDK's normalizer keeps; wrapping it in `Error` used to
      // throw the code away and leave only a generic message.
      throw result.error;
    }

    const { status, headers: responseHeaders, bodyText } = result.value;
    // A 204/205/304 response may not carry a body.
    const responseBody = status === 204 || status === 205 || status === 304 ? null : bodyText;
    return new Response(responseBody, { status, headers: responseHeaders });
  };
}

/**
 * A `fetch` for user-initiated manifest and registry URLs (install by URL, import).
 * These run before a provider exists, so there is no allowlist: main still enforces
 * the SSRF, redirect, size and time checks. Without this the production CSP, which
 * has no remote `connect-src`, would block the install flow.
 */
export function createUserInitiatedFetch(): typeof fetch {
  // On the web the page's own fetch is already the only transport.
  if (!hasDesktopBridge()) return globalThis.fetch.bind(globalThis);
  const adapter = createAppPlatformAdapter();

  return async (input: RequestInfo | URL): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const result = await adapter.network.fetchBytes(url);
    if (!result.ok) {
      throw result.error;
    }
    if (result.value === undefined) {
      throw new Error('Could not fetch the document.');
    }
    return new Response(result.value.data, {
      status: 200,
      headers: { 'content-type': result.value.mimeType },
    });
  };
}
