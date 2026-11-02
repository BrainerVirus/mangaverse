import { describe, expect, it, vi } from 'vitest';
import { PLATFORM_IPC } from '@app/platform';
import type { RequestHop } from './main-process-fetch.js';
import { createProviderAllowlist } from './provider-allowlist.js';
import { registerProviderNetworkIpc } from './provider-network-ipc.js';

function register(opts: { trusted?: boolean; requestHop?: RequestHop } = {}) {
  const put = vi.fn<(...args: unknown[]) => Promise<string>>(
    async () => 'page://store/abc',
  );
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const ipcMain = {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn);
    },
  };
  const allowlist = createProviderAllowlist();
  const requestHop =
    opts.requestHop ??
    vi.fn<RequestHop>(async () => ({
      kind: 'response',
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'secret=1' },
      body: Buffer.from('{"ok":true}'),
      finalUrl: 'https://api.mangadex.org/manga',
    }));
  const log = vi.fn<(event: { code: string; url?: string }) => void>();
  registerProviderNetworkIpc({
    ipcMain: ipcMain as never,
    allowlist,
    isTrustedFrame: (() => opts.trusted !== false) as never,
    networkTransport: {
      resolveHostAddresses: async (hostname) =>
        hostname === 'api.mangadex.org' ? ['93.184.216.34'] : ['127.0.0.1'],
      requestHop,
      log,
    },
    pageStore: {
      put,
      urlFor: async () => undefined,
      delete: async () => undefined,
      listKeys: async () => [],
      resolve: async () => ({ kind: 'refused' as const, status: 404 as const }),
    },
  });
  const call = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)!({ senderFrame: {} as never }, ...args);
  return { allowlist, call, requestHop, log, put };
}

describe('registerProviderNetworkIpc', () => {
  it('registers manifest domains and lets only those hosts through', async () => {
    const { allowlist, call } = register();

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org', '*.mangadex.network'],
    })) as { ok: boolean };

    expect(result.ok).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://evil.example/manga')).toBe(false);
  });

  it('unregisters on uninstall', async () => {
    const { allowlist, call } = register();
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_UNREGISTER, 'mangadex')) as {
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(allowlist.allowsUrl('mangadex', 'https://api.mangadex.org/manga')).toBe(false);
  });

  it('refuses a payload that carries a scheme or an invalid provider id', async () => {
    const { call } = register();

    const badDomain = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['https://api.mangadex.org'],
    })) as { ok: boolean };
    const badId = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'bad id',
      domains: ['api.mangadex.org'],
    })) as { ok: boolean };

    expect(badDomain.ok).toBe(false);
    expect(badId.ok).toBe(false);
  });

  it('runs a registered provider request in main and filters the response headers', async () => {
    const { call, requestHop } = register();
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REQUEST, {
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/manga',
      headers: { accept: 'application/json' },
    })) as {
      ok: boolean;
      value?: { status: number; headers: Record<string, string>; bodyText: string };
    };

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ status: 200, bodyText: '{"ok":true}' });
    expect(result.value?.headers).toEqual({ 'content-type': 'application/json' });
    expect(result.value?.headers).not.toHaveProperty('set-cookie');
    expect(requestHop).toHaveBeenCalledOnce();
    expect(requestHop.mock.calls[0]?.[0]).toMatchObject({
      address: '93.184.216.34',
      method: 'GET',
      headers: { accept: 'application/json' },
    });
  });

  it('refuses a request for an unknown provider or an undeclared host', async () => {
    const { call, requestHop } = register();
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const unknownProvider = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REQUEST, {
      providerId: 'other',
      url: 'https://api.mangadex.org/manga',
    })) as { ok: boolean; error?: { code?: string } };
    const undeclaredHost = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REQUEST, {
      providerId: 'mangadex',
      url: 'https://evil.example/manga',
    })) as { ok: boolean };

    expect(unknownProvider.ok).toBe(false);
    expect(unknownProvider.error?.code).toBe('platform.invalid-url');
    expect(undeclaredHost.ok).toBe(false);
    expect(requestHop).not.toHaveBeenCalled();
  });

  it('refuses a redirect to a host the provider did not declare, before that hop', async () => {
    const requestHop = vi.fn<RequestHop>(async () => ({
      kind: 'redirect',
      location: 'https://evil.example/steal',
      status: 302,
    }));
    const { call } = register({ requestHop });
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REQUEST, {
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/manga',
    })) as { ok: boolean; error?: { code?: string } };

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('platform.invalid-url');
    expect(requestHop).toHaveBeenCalledOnce();
  });

  it('returns a non-2xx provider response as a status, not an IPC error', async () => {
    const requestHop = vi.fn<RequestHop>(async () => ({
      kind: 'response',
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"error":"not_found"}'),
      finalUrl: 'https://api.mangadex.org/manga',
    }));
    const { call } = register({ requestHop });
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REQUEST, {
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/manga',
    })) as { ok: boolean; value?: { status: number } };

    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe(404);
  });

  it('fetches and stores a page in main, returning only its URL and size', async () => {
    const requestHop = vi.fn<RequestHop>(async () => ({
      kind: 'response',
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: Buffer.from([1, 2, 3]),
      finalUrl: 'https://api.mangadex.org/page.png',
    }));
    const { call, put } = register({ requestHop });
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_STORE, {
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/page.png',
      key: 'page:mangadex:m:c:0',
    })) as {
      ok: boolean;
      value?: { url: string; mimeType: string; byteSize: number };
    };

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ url: 'page://store/abc', mimeType: 'image/jpeg', byteSize: 3 });
    expect(result.value).not.toHaveProperty('data');
    expect(requestHop).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith('page:mangadex:m:c:0', expect.any(Uint8Array), 'image/jpeg');
  });

  it('refuses to store from a host the provider did not declare', async () => {
    const { call, put, requestHop } = register();
    await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_STORE, {
      providerId: 'mangadex',
      url: 'https://evil.example/page.png',
      key: 'page:mangadex:m:c:0',
    })) as { ok: boolean };

    expect(result.ok).toBe(false);
    expect(put).not.toHaveBeenCalled();
    expect(requestHop).not.toHaveBeenCalled();
  });

  it('refuses a registration from a frame that is not the app frame', async () => {
    const { allowlist, call } = register({ trusted: false });

    const result = (await call(PLATFORM_IPC.PROVIDER_NETWORK_REGISTER, {
      providerId: 'mangadex',
      domains: ['api.mangadex.org'],
    })) as { ok: boolean };

    expect(result.ok).toBe(false);
    expect(allowlist.size()).toBe(0);
  });
});
