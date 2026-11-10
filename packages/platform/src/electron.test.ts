import { describe, expect, it, vi } from 'vitest';
import { ok, type AppResult } from '@app/shared';
import { createElectronPlatformAdapter } from './electron.js';
import type {
  DesktopPlatformBridge,
  LocalServiceInfo,
  PlatformCapabilities,
  PlatformDiagnosticsSnapshot,
  PlatformFileOpenOptions,
  PlatformFileResult,
  PlatformFileSaveOptions,
  PlatformNetworkFetchResult,
} from './types.js';

const updateStubs = {
  updateSetReaderActive: async () => ok(undefined),
  updateInstall: async () => ok(undefined),
  updateDismiss: async () => ok(undefined),
  onUpdateAvailable: () => () => {},
  updateGetState: async () =>
    ok({
      enabled: false,
      currentVersion: '0.0.0',
      lastCheckedAt: null,
      phase: { kind: 'idle' as const },
    }),
  updateCheckNow: async () =>
    ok({
      enabled: false,
      currentVersion: '0.0.0',
      lastCheckedAt: null,
      phase: { kind: 'idle' as const },
    }),
  onUpdateState: () => () => {},
  windowChromeGet: async () => ok({ platform: 'darwin' as const, fullScreen: false, height: 36 }),
  windowSetTitleBarColors: async () => ok(undefined),
  onWindowChrome: () => () => {},
} satisfies Pick<
  DesktopPlatformBridge,
  | 'updateSetReaderActive'
  | 'updateInstall'
  | 'updateDismiss'
  | 'onUpdateAvailable'
  | 'updateGetState'
  | 'updateCheckNow'
  | 'onUpdateState'
  | 'windowChromeGet'
  | 'windowSetTitleBarColors'
  | 'onWindowChrome'
>;

const pageStoreStubs = {
  pageStorePut: async () => ok('page://store/id'),
  pageStoreUrl: async () => ok(undefined),
  pageStoreVerify: async () => ok(undefined),
  pageStoreDelete: async () => ok(undefined),
  pageStoreListKeys: async () => ok([]),
  rendererImportState: async () => ok({ completed: false, database: null, blobChecksums: {} }),
  rendererImportComplete: async () => ok(undefined),
  providerNetworkReplace: async () => ok(undefined),
  providerNetworkRevoke: async () => ok(undefined),
  providerNetworkNextRevision: async () => ok(1),
  providerNetworkRequest: async () =>
    ok({ status: 200, headers: {}, bodyText: '', finalUrl: 'https://example.com' }),
  providerNetworkStore: async () =>
    ok({ url: 'page://store/id', mimeType: 'image/jpeg', byteSize: 3 }),
  providerNetworkStoreUserInitiated: async () =>
    ok({ url: 'page://store/id', mimeType: 'image/jpeg', byteSize: 3 }),
  ...updateStubs,
} satisfies Pick<
  DesktopPlatformBridge,
  | 'pageStorePut'
  | 'pageStoreUrl'
  | 'pageStoreVerify'
  | 'pageStoreDelete'
  | 'pageStoreListKeys'
  | 'rendererImportState'
  | 'rendererImportComplete'
  | 'providerNetworkReplace'
  | 'providerNetworkRevoke'
  | 'providerNetworkNextRevision'
  | 'providerNetworkRequest'
  | 'providerNetworkStore'
  | 'providerNetworkStoreUserInitiated'
  | 'updateSetReaderActive'
  | 'updateInstall'
  | 'updateDismiss'
  | 'onUpdateAvailable'
  | 'updateGetState'
  | 'updateCheckNow'
  | 'onUpdateState'
  | 'windowChromeGet'
  | 'windowSetTitleBarColors'
  | 'onWindowChrome'
>;

describe('createElectronPlatformAdapter', () => {
  const caps: PlatformCapabilities = {
    runtime: 'electron',
    clipboardRead: true,
    clipboardWrite: true,
    nativeFileOpen: true,
    nativeFileSave: true,
    nativeFullscreen: true,
    externalLinks: true,
    protocolInstallHandoff: true,
    installPrompt: false,
    secureStorage: true,
    diagnostics: true,
    localService: true,
    sqliteRuntime: true,
    persistentStorage: true,
    storageEstimate: true,
  };

  it('reads capabilities from fake bridge', async () => {
    const bridge: DesktopPlatformBridge = {
      getCapabilities: async () => ok(caps),
      clipboardReadText: async () => ok('x'),
      clipboardWriteText: async () => ok(undefined),
      fileOpenText: async () => ok({ content: 'c' }),
      fileSaveText: async () => ok({ content: 'c' }),
      fullscreenEnter: async () => ok(undefined),
      fullscreenExit: async () => ok(undefined),
      fullscreenIsActive: async () => ok(false),
      protocolGetPendingInstallUrl: async () => ok(null),
      externalLinkOpen: async () => ok(undefined),
      secureStorageGet: async () => ok(undefined),
      secureStorageSet: async () => ok(undefined),
      secureStorageDelete: async () => ok(undefined),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: true, host: '127.0.0.1', port: 9 }),
      networkFetchBytes: async () => ok(undefined),
      ...pageStoreStubs,
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const r = await adapter.capabilities();
    expect(r.ok && r.value.runtime).toBe('electron');
  });

  it('delegates grouped calls to the bridge', async () => {
    const bridge: DesktopPlatformBridge = {
      getCapabilities: vi.fn<() => Promise<AppResult<PlatformCapabilities>>>(async () => ok(caps)),
      clipboardReadText: vi.fn<() => Promise<AppResult<string>>>(async () => ok('clip')),
      clipboardWriteText: vi.fn<(text: string) => Promise<AppResult<void>>>(async () =>
        ok(undefined),
      ),
      fileOpenText: vi.fn<
        (options: PlatformFileOpenOptions) => Promise<AppResult<PlatformFileResult>>
      >(async () => ok({ path: 'p', content: 'open' })),
      fileSaveText: vi.fn<
        (options: PlatformFileSaveOptions) => Promise<AppResult<PlatformFileResult>>
      >(async () => ok({ path: 'p', content: 'save' })),
      fullscreenEnter: vi.fn<() => Promise<AppResult<void>>>(async () => ok(undefined)),
      fullscreenExit: vi.fn<() => Promise<AppResult<void>>>(async () => ok(undefined)),
      fullscreenIsActive: vi.fn<() => Promise<AppResult<boolean>>>(async () => ok(true)),
      protocolGetPendingInstallUrl: vi.fn<() => Promise<AppResult<string | null>>>(async () =>
        ok('https://example.com'),
      ),
      externalLinkOpen: vi.fn<(url: string) => Promise<AppResult<void>>>(async () => ok(undefined)),
      secureStorageGet: vi.fn<(key: string) => Promise<AppResult<string | undefined>>>(async () =>
        ok('secret'),
      ),
      secureStorageSet: vi.fn<(key: string, value: string) => Promise<AppResult<void>>>(async () =>
        ok(undefined),
      ),
      secureStorageDelete: vi.fn<(key: string) => Promise<AppResult<void>>>(async () =>
        ok(undefined),
      ),
      diagnosticsGetSnapshot: vi.fn<() => Promise<AppResult<PlatformDiagnosticsSnapshot>>>(
        async () => ok({ platform: 'darwin' }),
      ),
      localServiceGetInfo: vi.fn<() => Promise<AppResult<LocalServiceInfo>>>(async () =>
        ok({ running: true, host: '127.0.0.1', port: 123 }),
      ),
      networkFetchBytes: vi.fn<
        (url: string) => Promise<AppResult<PlatformNetworkFetchResult | undefined>>
      >(async () => ok(undefined)),
      ...pageStoreStubs,
    };
    const adapter = createElectronPlatformAdapter(bridge);

    await adapter.clipboard.readText();
    await adapter.clipboard.writeText('a');
    await adapter.files.openTextFile({});
    await adapter.files.saveTextFile({ content: 'x' });
    await adapter.fullscreen.enter();
    await adapter.fullscreen.exit();
    await adapter.fullscreen.isActive();
    await adapter.protocol.getPendingInstallUrl();
    await adapter.secureStorage.get('k');
    await adapter.secureStorage.set('k', 'v');
    await adapter.secureStorage.delete('k');
    await adapter.diagnostics.getSnapshot();
    await adapter.localService.getInfo();

    expect(bridge.clipboardReadText).toHaveBeenCalledTimes(1);
    expect(bridge.clipboardWriteText).toHaveBeenCalledWith('a');
    expect(bridge.fileOpenText).toHaveBeenCalled();
    expect(bridge.fileSaveText).toHaveBeenCalled();
    expect(bridge.fullscreenEnter).toHaveBeenCalled();
    expect(bridge.fullscreenExit).toHaveBeenCalled();
    expect(bridge.fullscreenIsActive).toHaveBeenCalled();
    expect(bridge.protocolGetPendingInstallUrl).toHaveBeenCalled();
    expect(bridge.secureStorageGet).toHaveBeenCalledWith('k');
    expect(bridge.secureStorageSet).toHaveBeenCalledWith('k', 'v');
    expect(bridge.secureStorageDelete).toHaveBeenCalledWith('k');
    expect(bridge.diagnosticsGetSnapshot).toHaveBeenCalled();
    expect(bridge.localServiceGetInfo).toHaveBeenCalled();
  });

  it('delegates the window chrome to the bridge', async () => {
    const windowSetTitleBarColors = vi.fn<
      (color: string, symbolColor: string) => Promise<AppResult<void>>
    >(async () => ok(undefined));
    const unsubscribe = vi.fn<() => void>();
    const onWindowChrome = vi.fn<DesktopPlatformBridge['onWindowChrome']>(() => unsubscribe);
    const bridge: DesktopPlatformBridge = {
      getCapabilities: async () => ok(caps),
      clipboardReadText: async () => ok(''),
      clipboardWriteText: async () => ok(undefined),
      fileOpenText: async () => ok({ content: '' }),
      fileSaveText: async () => ok({ content: '' }),
      fullscreenEnter: async () => ok(undefined),
      fullscreenExit: async () => ok(undefined),
      fullscreenIsActive: async () => ok(false),
      protocolGetPendingInstallUrl: async () => ok(null),
      externalLinkOpen: async () => ok(undefined),
      secureStorageGet: async () => ok(undefined),
      secureStorageSet: async () => ok(undefined),
      secureStorageDelete: async () => ok(undefined),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes: async () => ok(undefined),
      ...pageStoreStubs,
      windowSetTitleBarColors,
      onWindowChrome,
    };
    const chrome = createElectronPlatformAdapter(bridge).windowChrome!;

    expect(await chrome.get()).toEqual(ok({ platform: 'darwin', fullScreen: false, height: 36 }));
    await chrome.setColors('#fafafa', '#1a1a1a');
    expect(windowSetTitleBarColors).toHaveBeenCalledWith('#fafafa', '#1a1a1a');
    const listener = () => {};
    expect(chrome.onChange(listener)).toBe(unsubscribe);
    expect(onWindowChrome).toHaveBeenCalledWith(listener);
  });

  it('rejects invalid external URLs before calling bridge', async () => {
    const bridge: DesktopPlatformBridge = {
      getCapabilities: async () => ok(caps),
      clipboardReadText: async () => ok(''),
      clipboardWriteText: async () => ok(undefined),
      fileOpenText: async () => ok({ content: '' }),
      fileSaveText: async () => ok({ content: '' }),
      fullscreenEnter: async () => ok(undefined),
      fullscreenExit: async () => ok(undefined),
      fullscreenIsActive: async () => ok(false),
      protocolGetPendingInstallUrl: async () => ok(null),
      externalLinkOpen: vi.fn<(url: string) => Promise<AppResult<void>>>(async () => ok(undefined)),
      secureStorageGet: async () => ok(undefined),
      secureStorageSet: async () => ok(undefined),
      secureStorageDelete: async () => ok(undefined),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes: async () => ok(undefined),
      ...pageStoreStubs,
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const bad = await adapter.externalLinks.open('file:///etc/passwd');
    expect(bad.ok).toBe(false);
    expect(bridge.externalLinkOpen).not.toHaveBeenCalled();
  });

  it('fetchBytes delegates to main and ignores the web provider option', async () => {
    const networkFetchBytes = vi.fn<
      (url: string) => Promise<AppResult<PlatformNetworkFetchResult | undefined>>
    >(async () => ok({ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/jpeg' }));
    const bridge: DesktopPlatformBridge = {
      getCapabilities: async () => ok(caps),
      clipboardReadText: async () => ok(''),
      clipboardWriteText: async () => ok(undefined),
      fileOpenText: async () => ok({ content: '' }),
      fileSaveText: async () => ok({ content: '' }),
      fullscreenEnter: async () => ok(undefined),
      fullscreenExit: async () => ok(undefined),
      fullscreenIsActive: async () => ok(false),
      protocolGetPendingInstallUrl: async () => ok(null),
      externalLinkOpen: async () => ok(undefined),
      secureStorageGet: async () => ok(undefined),
      secureStorageSet: async () => ok(undefined),
      secureStorageDelete: async () => ok(undefined),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes,
      ...pageStoreStubs,
    };
    const adapter = createElectronPlatformAdapter(bridge);

    const result = await adapter.network.fetchBytes('https://uploads.mangadex.org/page.jpg', {
      providerId: 'mangadex',
    });

    expect(result.ok).toBe(true);
    expect(networkFetchBytes).toHaveBeenCalledWith('https://uploads.mangadex.org/page.jpg');
  });

  it('converts thrown bridge errors into AppResult failures', async () => {
    const bridge: DesktopPlatformBridge = {
      getCapabilities: async () => {
        throw new Error('boom');
      },
      clipboardReadText: async () => ok(''),
      clipboardWriteText: async () => ok(undefined),
      fileOpenText: async () => ok({ content: '' }),
      fileSaveText: async () => ok({ content: '' }),
      fullscreenEnter: async () => ok(undefined),
      fullscreenExit: async () => ok(undefined),
      fullscreenIsActive: async () => ok(false),
      protocolGetPendingInstallUrl: async () => ok(null),
      externalLinkOpen: async () => ok(undefined),
      secureStorageGet: async () => ok(undefined),
      secureStorageSet: async () => ok(undefined),
      secureStorageDelete: async () => ok(undefined),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes: async () => ok(undefined),
      ...pageStoreStubs,
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const r = await adapter.capabilities();
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected capabilities to fail');
    }
    expect(r.error.code).toBe('platform.unexpected');
  });

  it('rejects invalid secure storage keys before calling bridge', async () => {
    const bridge: DesktopPlatformBridge = {
      getCapabilities: async () => ok(caps),
      clipboardReadText: async () => ok(''),
      clipboardWriteText: async () => ok(undefined),
      fileOpenText: async () => ok({ content: '' }),
      fileSaveText: async () => ok({ content: '' }),
      fullscreenEnter: async () => ok(undefined),
      fullscreenExit: async () => ok(undefined),
      fullscreenIsActive: async () => ok(false),
      protocolGetPendingInstallUrl: async () => ok(null),
      externalLinkOpen: async () => ok(undefined),
      secureStorageGet: vi.fn<(key: string) => Promise<AppResult<string | undefined>>>(async () =>
        ok(undefined),
      ),
      secureStorageSet: vi.fn<(key: string, value: string) => Promise<AppResult<void>>>(async () =>
        ok(undefined),
      ),
      secureStorageDelete: vi.fn<(key: string) => Promise<AppResult<void>>>(async () =>
        ok(undefined),
      ),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes: async () => ok(undefined),
      ...pageStoreStubs,
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const badKey = await adapter.secureStorage.get('bad key!');
    expect(badKey.ok).toBe(false);
    expect(bridge.secureStorageGet).not.toHaveBeenCalled();
  });

  it('returns unsupported for general storage on desktop', async () => {
    const bridge: DesktopPlatformBridge = {
      getCapabilities: async () => ok(caps),
      clipboardReadText: async () => ok(''),
      clipboardWriteText: async () => ok(undefined),
      fileOpenText: async () => ok({ content: '' }),
      fileSaveText: async () => ok({ content: '' }),
      fullscreenEnter: async () => ok(undefined),
      fullscreenExit: async () => ok(undefined),
      fullscreenIsActive: async () => ok(false),
      protocolGetPendingInstallUrl: async () => ok(null),
      externalLinkOpen: async () => ok(undefined),
      secureStorageGet: async () => ok(undefined),
      secureStorageSet: async () => ok(undefined),
      secureStorageDelete: async () => ok(undefined),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes: async () => ok(undefined),
      ...pageStoreStubs,
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const r = await adapter.storage.getItem('reader.preference');
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error('expected desktop storage to be unsupported');
    }
    expect(r.error.code).toBe('platform.unsupported');
  });

  it('routes page blobs to the main page store and never to IndexedDB', async () => {
    const pageId = 'a'.repeat(64);
    const pageStorePut = vi.fn<DesktopPlatformBridge['pageStorePut']>(async () =>
      ok(`page://store/${pageId}`),
    );
    const pageStoreUrl = vi.fn<DesktopPlatformBridge['pageStoreUrl']>(async () =>
      ok(`page://store/${pageId}`),
    );
    const pageStoreDelete = vi.fn<DesktopPlatformBridge['pageStoreDelete']>(async () =>
      ok(undefined),
    );
    const pageStoreListKeys = vi.fn<DesktopPlatformBridge['pageStoreListKeys']>(async () =>
      ok(['page:p:m:c:0']),
    );
    const pageStoreVerify = vi.fn<DesktopPlatformBridge['pageStoreVerify']>(async () =>
      ok(undefined),
    );
    const indexedDB = { open: vi.fn<() => never>() };
    vi.stubGlobal('indexedDB', indexedDB);
    try {
      const adapter = createElectronPlatformAdapter({
        getCapabilities: async () => ok(caps),
        clipboardReadText: async () => ok(''),
        clipboardWriteText: async () => ok(undefined),
        fileOpenText: async () => ok({ content: '' }),
        fileSaveText: async () => ok({ content: '' }),
        fullscreenEnter: async () => ok(undefined),
        fullscreenExit: async () => ok(undefined),
        fullscreenIsActive: async () => ok(false),
        protocolGetPendingInstallUrl: async () => ok(null),
        externalLinkOpen: async () => ok(undefined),
        secureStorageGet: async () => ok(undefined),
        secureStorageSet: async () => ok(undefined),
        secureStorageDelete: async () => ok(undefined),
        diagnosticsGetSnapshot: async () => ok({}),
        localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
        networkFetchBytes: async () => ok(undefined),
        pageStorePut,
        pageStoreUrl,
        pageStoreVerify,
        pageStoreDelete,
        pageStoreListKeys,
        rendererImportState: async () =>
          ok({ completed: false, database: null, blobChecksums: {} }),
        rendererImportComplete: async () => ok(undefined),
        providerNetworkReplace: async () => ok(undefined),
        providerNetworkRevoke: async () => ok(undefined),
        providerNetworkNextRevision: async () => ok(1),
        providerNetworkRequest: async () =>
          ok({ status: 200, headers: {}, bodyText: '', finalUrl: 'https://example.com' }),
        providerNetworkStore: async () =>
          ok({ url: 'page://store/id', mimeType: 'image/jpeg', byteSize: 3 }),
        providerNetworkStoreUserInitiated: async () =>
          ok({ url: 'page://store/id', mimeType: 'image/jpeg', byteSize: 3 }),
        ...updateStubs,
      });
      const key = 'page:p:m:c:0';
      const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;

      expect(await adapter.blobStorage.put(key, bytes, 'image/jpeg')).toEqual(ok(undefined));
      expect(pageStorePut).toHaveBeenCalledWith(key, bytes, 'image/jpeg');
      expect(await adapter.blobStorage.resolveUrl?.(key)).toEqual(ok(`page://store/${pageId}`));
      expect((await adapter.blobStorage.get(key)).ok).toBe(false);
      expect(await adapter.blobStorage.delete(key)).toEqual(ok(undefined));
      expect(pageStoreDelete).toHaveBeenCalledWith(key);
      // A page URL is not an object URL: revoking it touches nothing.
      expect(await adapter.blobStorage.revokeObjectUrl(`page://store/${pageId}`)).toEqual(
        ok(undefined),
      );
      expect(indexedDB.open).not.toHaveBeenCalled();
      // Covers keep IndexedDB and are not served by URL.
      expect((await adapter.blobStorage.resolveUrl?.('cover:p:m'))?.ok).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
