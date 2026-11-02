import type { HopReply, NetworkTransportDeps } from './main-process-fetch.js';
import { nodeRequestHop } from './main-process-fetch.js';

/**
 * Test-only transport used by the Electron E2E: it answers the recorded MangaDex
 * hosts from a local fixture server while the real allowlist, redirect, address,
 * size and deadline checks still run. Enabled only by main's own environment
 * (`MANGAVERSE_E2E_PROVIDER_FIXTURE`), never by renderer input, and every other
 * host still uses the production hop.
 */
const FIXTURE_HOSTS: ReadonlySet<string> = new Set(['api.mangadex.org', 'uploads.mangadex.org']);

function isFixtureHost(hostname: string): boolean {
  return FIXTURE_HOSTS.has(hostname) || hostname.endsWith('.mangadex.network');
}

async function fixtureHop(
  origin: URL,
  request: Parameters<typeof nodeRequestHop>[0],
): Promise<HopReply> {
  const target = new URL(`${request.url.pathname}${request.url.search}`, origin);
  const response = await fetch(target, {
    method: request.method ?? 'GET',
    ...(request.headers !== undefined ? { headers: request.headers } : {}),
    ...(request.body !== undefined ? { body: request.body } : {}),
    redirect: 'manual',
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  if (response.status >= 300 && response.status < 400) {
    const location = headers.location;
    if (location !== undefined) {
      return { kind: 'redirect', location, status: response.status };
    }
  }
  const body = Buffer.from(await response.arrayBuffer());
  return {
    kind: 'response',
    status: response.status,
    headers,
    body,
    finalUrl: request.url.toString(),
  };
}

export function createFixtureTransport(
  fixtureOrigin: string,
  fallback: NetworkTransportDeps,
): NetworkTransportDeps {
  const origin = new URL(fixtureOrigin);
  return {
    resolveHostAddresses: async (hostname) =>
      isFixtureHost(hostname) ? ['93.184.216.34'] : fallback.resolveHostAddresses(hostname),
    ...(fallback.log !== undefined ? { log: fallback.log } : {}),
    requestHop: async (request) =>
      isFixtureHost(request.url.hostname)
        ? fixtureHop(origin, request)
        : (fallback.requestHop ?? nodeRequestHop)(request),
  };
}
