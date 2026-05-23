import { describe, expect, it, vi } from 'vitest';
import { createWebPlatformAdapter } from './web.js';

describe('createWebPlatformAdapter', () => {
  it('clipboard uses injected navigator methods', async () => {
    const readText = vi.fn(async () => 'hello');
    const writeText = vi.fn(async () => {});
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
    const requestFullscreen = vi.fn(async () => {});
    const exitFullscreen = vi.fn(async () => {});
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
    const createObjectUrl = vi.fn(() => 'blob:mock');
    const revokeObjectUrl = vi.fn();
    const createDownload = vi.fn();
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
    if (!r.ok) {
      expect(r.error.code).toBe('platform.unsupported');
    }
  });

  it('secure storage returns unsupported', async () => {
    const adapter = createWebPlatformAdapter({});
    const r = await adapter.secureStorage.get('k');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('platform.unsupported');
    }
  });

  it('storage getItem/setItem/deleteItem uses injected localStorage', async () => {
    const store = new Map<string, string | null>();
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { hasLocalStorage: true },
      localStorage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => { store.set(k, v); },
        removeItem: (k) => { store.delete(k); },
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
    if (!r.ok) expect(r.error.code).toBe('platform.unsupported');
  });

  it('storage estimate uses injected storageManager', async () => {
    const estimate = vi.fn(async () => ({ quota: 1024, usage: 512 }));
    const persisted = vi.fn(async () => true);
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { hasStorageEstimate: true, isSecureContext: true },
      storageManager: { estimate, persist: vi.fn(), persisted },
    });
    const r = await adapter.storage.estimate();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.quota).toBe(1024);
      expect(r.value.usage).toBe(512);
      expect(r.value.persisted).toBe(true);
    }
  });

  it('storage persist delegates to injected storageManager', async () => {
    const persist = vi.fn(async () => true);
    const adapter = createWebPlatformAdapter({
      capabilityProbe: { hasStoragePersist: true },
      storageManager: { estimate: vi.fn(), persist, persisted: vi.fn() },
    });
    const r = await adapter.storage.persist();
    expect(r.ok && r.value).toBe(true);
    expect(persist).toHaveBeenCalled();
  });

  it('storage estimate returns unsupported when storageManager is absent', async () => {
    const adapter = createWebPlatformAdapter({});
    const r = await adapter.storage.estimate();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('platform.unsupported');
  });

  it('storage persist returns unsupported when persist is absent', async () => {
    const adapter = createWebPlatformAdapter({
      storageManager: { estimate: vi.fn() },
    });
    const r = await adapter.storage.persist();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('platform.unsupported');
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
    if (r.ok) {
      expect(r.value.nativeFileSave).toBe(true);
      expect(r.value.persistentStorage).toBe(true);
      expect(r.value.storageEstimate).toBe(true);
    }
  });
});
