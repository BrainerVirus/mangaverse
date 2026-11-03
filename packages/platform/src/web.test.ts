import { describe, expect, it, vi } from 'vitest';
import type { ProviderNetworkRefusal } from './types.js';
import { createWebPlatformAdapter } from './web.js';

describe('createWebPlatformAdapter', () => {
  it('clipboard uses injected navigator methods', async () => {
    const readText = vi.fn<() => Promise<string>>(async () => 'hello');
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    const adapter = createWebPlatformAdapter({
      capabilityProbe: {
        hasClipboardRead: true,
        hasClipboardWrite: true,
      },
      navigatorClipboard: { readText, writeText },
    });
    const r = await adapter.clipboard.readText();
    expect(r.ok && r.value).toBe('hello');
    await adapter.clipboard.writeText('x');
    expect(writeText).toHaveBeenCalledWith('x');
  });

  it('fullscreen uses injected element methods', async () => {
    const el = {} as Element;
    const requestFullscreen = vi.fn<(element: Element) => Promise<void>>(async () => {});
    const exitFullscreen = vi.fn<() => Promise<void>>(async () => {});
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { fullscreenEnabled: true },
      getDocumentElement: () => el,
      requestFullscreen,
      exitFullscreen,
      getFullscreenElement: () => el,
    });
    await adapter.fullscreen.enter();
    await adapter.fullscreen.exit();
    const active = await adapter.fullscreen.isActive();
    expect(requestFullscreen).toHaveBeenCalledWith(el);
    expect(exitFullscreen).toHaveBeenCalled();
    expect(active.ok && active.value).toBe(true);
  });

  it('rejects invalid external URLs', async () => {
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { hasRegisterProtocolHandler: false },
    });
    const r = await adapter.externalLinks.open('file:///x');
    expect(r.ok).toBe(false);
  });

  it('saveTextFile uses injected download hooks', async () => {
    const createObjectUrl = vi.fn<(blob: Blob) => string>(() => 'blob:mock');
    const revokeObjectUrl = vi.fn<(url: string) => void>();
    const createDownload = vi.fn<(filename: string, href: string) => void>();
    const adapter = createWebPlatformAdapter({
      createObjectUrl,
      revokeObjectUrl,
      createDownload,
    });
    const r = await adapter.files.saveTextFile({ content: 'data', suggestedName: 'out.txt' });
    expect(r.ok).toBe(true);
    expect(createObjectUrl).toHaveBeenCalled();
    expect(createDownload).toHaveBeenCalledWith('out.txt', 'blob:mock');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock');
  });

  it('openTextFile returns unsupported', async () => {
    const adapter = createWebPlatformAdapter({});
    const r = await adapter.files.openTextFile({});
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected openTextFile to be unsupported');
    }
    expect(r.error.code).toBe('platform.unsupported');
  });

  it('secure storage returns unsupported', async () => {
    const adapter = createWebPlatformAdapter({});
    const r = await adapter.secureStorage.get('k');
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected secure storage to be unsupported');
    }
    expect(r.error.code).toBe('platform.unsupported');
  });

  it('storage getItem/setItem/deleteItem uses injected localStorage', async () => {
    const store = new Map<string, string | null>();
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { hasLocalStorage: true },
      localStorage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => {
          store.set(k, v);
        },
        removeItem: (k) => {
          store.delete(k);
        },
      },
    });
    await adapter.storage.setItem('a', '1');
    const r = await adapter.storage.getItem('a');
    expect(r.ok && r.value).toBe('1');
    await adapter.storage.deleteItem('a');
    const r2 = await adapter.storage.getItem('a');
    expect(r2.ok && r2.value).toBeUndefined();
  });

  it('storage returns unsupported when localStorage is absent', async () => {
    const adapter = createWebPlatformAdapter({});
    const r = await adapter.storage.getItem('k');
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected storage to be unsupported');
    }
    expect(r.error.code).toBe('platform.unsupported');
  });

  it('storage estimate uses injected storageManager', async () => {
    const estimate = vi.fn<() => Promise<{ quota: number; usage: number }>>(async () => ({
      quota: 1024,
      usage: 512,
    }));
    const persisted = vi.fn<() => Promise<boolean>>(async () => true);
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { hasStorageEstimate: true, isSecureContext: true },
      storageManager: {
        estimate,
        persist: vi.fn<() => Promise<boolean>>(),
        persisted,
      },
    });
    const r = await adapter.storage.estimate();
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error('expected storage estimate to succeed');
    }
    expect(r.value.quota).toBe(1024);
    expect(r.value.usage).toBe(512);
    expect(r.value.persisted).toBe(true);
  });

  it('storage persist delegates to injected storageManager', async () => {
    const persist = vi.fn<() => Promise<boolean>>(async () => true);
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { hasStoragePersist: true },
      storageManager: {
        estimate: vi.fn<() => Promise<{ quota: number; usage: number }>>(),
        persist,
        persisted: vi.fn<() => Promise<boolean>>(),
      },
    });
    const r = await adapter.storage.persist();
    expect(r.ok && r.value).toBe(true);
    expect(persist).toHaveBeenCalled();
  });

  it('storage estimate returns unsupported when storageManager is absent', async () => {
    const adapter = createWebPlatformAdapter({});
    const r = await adapter.storage.estimate();
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected storage estimate to be unsupported');
    }
    expect(r.error.code).toBe('platform.unsupported');
  });

  it('storage persist returns unsupported when persist is absent', async () => {
    const adapter = createWebPlatformAdapter({
      storageManager: { estimate: vi.fn<() => Promise<{ quota: number; usage: number }>>() },
    });
    const r = await adapter.storage.persist();
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected storage persist to be unsupported');
    }
    expect(r.error.code).toBe('platform.unsupported');
  });

  it('capabilities reflect injected storage and download dependencies', async () => {
    const adapter = createWebPlatformAdapter({
      capabilityProbe: {
        isSecureContext: true,
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
      storageManager: {
        estimate: async () => ({ quota: 10, usage: 1 }),
        persist: async () => true,
        persisted: async () => false,
      },
      createObjectUrl: () => 'blob:mock',
      revokeObjectUrl: () => {},
      createDownload: () => {},
    });

    const r = await adapter.capabilities();
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error('expected capabilities to succeed');
    }
    expect(r.value.nativeFileSave).toBe(true);
    expect(r.value.persistentStorage).toBe(true);
    expect(r.value.storageEstimate).toBe(true);
  });
});

describe('web providerNetwork domains', () => {
  it('refuses an undeclared host before calling the injected fetch', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    const adapter = createWebPlatformAdapter({ fetch: fetchImpl });

    const result = await adapter.providerNetwork.request({
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/manga',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the request to be refused');
    expect(result.error.code).toBe('platform.invalid-url');
    expect(result.error.message).toBe('Provider may not reach this host.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows a declared host and refuses a redirect to an undeclared host', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input) => {
        const url = String(input);
        const response = new Response('{"ok":true}', { status: 200 });
        if (url.includes('/redirect')) {
          // The browser follows redirects itself; the final URL is what surfaces.
          Object.defineProperty(response, 'url', { value: 'https://evil.example/x' });
        } else {
          Object.defineProperty(response, 'url', { value: url });
        }
        return response;
      },
    );
    const adapter = createWebPlatformAdapter({ fetch: fetchImpl });
    await adapter.providerNetwork.replaceProviders(
      [{ providerId: 'mangadex', domains: ['api.mangadex.org', '*.mangadex.network'] }],
      1,
    );

    expect(
      adapter.providerNetwork.isAllowedHost?.('mangadex', 'https://api.mangadex.org/manga'),
    ).toBe(true);
    expect(adapter.providerNetwork.isAllowedHost?.('mangadex', 'https://evil.example/x')).toBe(
      false,
    );

    const allowed = await adapter.providerNetwork.request({
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/manga',
    });
    expect(allowed.ok).toBe(true);

    const redirected = await adapter.providerNetwork.request({
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/redirect',
    });
    expect(redirected.ok).toBe(false);
    if (redirected.ok) throw new Error('expected the redirect to be refused');
    expect(redirected.error.code).toBe('platform.invalid-url');
  });

  it('records an API refusal through the injected sink', async () => {
    const refusals: ProviderNetworkRefusal[] = [];
    const adapter = createWebPlatformAdapter({
      fetch: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
        async () => new Response('{}', { status: 200 }),
      ),
      onProviderRequestRefused: (refusal) => refusals.push(refusal),
    });
    await adapter.providerNetwork.replaceProviders(
      [{ providerId: 'mangadex', domains: ['api.mangadex.org'] }],
      1,
    );

    await adapter.providerNetwork.request({
      providerId: 'mangadex',
      url: 'https://evil.example/manga',
    });

    expect(refusals).toEqual([
      {
        kind: 'api',
        providerId: 'mangadex',
        host: 'evil.example',
        reason: 'undeclared-host',
      },
    ]);
  });

  it('drops a provider on revoke so its next request is refused', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    const adapter = createWebPlatformAdapter({ fetch: fetchImpl });
    await adapter.providerNetwork.replaceProviders(
      [{ providerId: 'mangadex', domains: ['api.mangadex.org'] }],
      1,
    );
    await adapter.providerNetwork.revokeProvider('mangadex', 2);

    const result = await adapter.providerNetwork.request({
      providerId: 'mangadex',
      url: 'https://api.mangadex.org/manga',
    });

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('web providerNetwork byte fetches', () => {
  function imageResponse(url: string): Response {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/jpeg' },
    });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  }

  it('Given a declared image host, When the bytes come back, Then they are returned', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input) => imageResponse(String(input)),
    );
    const refusals: ProviderNetworkRefusal[] = [];
    const adapter = createWebPlatformAdapter({
      fetch: fetchImpl,
      onProviderRequestRefused: (refusal) => refusals.push(refusal),
    });
    await adapter.providerNetwork.replaceProviders(
      [{ providerId: 'mangadex', domains: ['uploads.mangadex.org'] }],
      1,
    );

    const result = await adapter.network.fetchBytes('https://uploads.mangadex.org/page.jpg', {
      providerId: 'mangadex',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the bytes to be returned');
    expect(result.value?.data.byteLength).toBe(3);
    expect(refusals).toEqual([]);
  });

  it('Given a declared host that redirects to an undeclared one, Then no bytes are delivered', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (input) =>
        imageResponse(
          String(input) === 'https://uploads.mangadex.org/redirect.jpg'
            ? 'https://evil.example/page.jpg'
            : String(input),
        ),
    );
    const refusals: ProviderNetworkRefusal[] = [];
    const adapter = createWebPlatformAdapter({
      fetch: fetchImpl,
      onProviderRequestRefused: (refusal) => refusals.push(refusal),
    });
    await adapter.providerNetwork.replaceProviders(
      [{ providerId: 'mangadex', domains: ['uploads.mangadex.org'] }],
      1,
    );

    const result = await adapter.network.fetchBytes('https://uploads.mangadex.org/redirect.jpg', {
      providerId: 'mangadex',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the redirected fetch to be refused');
    expect(result.error.code).toBe('platform.invalid-url');
    expect(refusals).toEqual([
      {
        kind: 'image',
        providerId: 'mangadex',
        host: 'evil.example',
        reason: 'redirected-host',
      },
    ]);
  });

  it('Given an undeclared image host, Then the fetch is refused before a request', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => imageResponse('https://evil.example/page.jpg'),
    );
    const refusals: ProviderNetworkRefusal[] = [];
    const adapter = createWebPlatformAdapter({
      fetch: fetchImpl,
      onProviderRequestRefused: (refusal) => refusals.push(refusal),
    });
    await adapter.providerNetwork.replaceProviders(
      [{ providerId: 'mangadex', domains: ['uploads.mangadex.org'] }],
      1,
    );

    const result = await adapter.network.fetchBytes('https://evil.example/page.jpg', {
      providerId: 'mangadex',
    });

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(refusals).toEqual([
      {
        kind: 'image',
        providerId: 'mangadex',
        host: 'evil.example',
        reason: 'undeclared-host',
      },
    ]);
  });
});
