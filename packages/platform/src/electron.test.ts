import { describe, expect, it, vi } from 'vitest';
import { ok } from '@app/shared';
import { createElectronPlatformAdapter } from './electron.js';
import type { DesktopPlatformBridge, PlatformCapabilities } from './types.js';

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
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const r = await adapter.capabilities();
    expect(r.ok && r.value.runtime).toBe('electron');
  });

  it('delegates grouped calls to the bridge', async () => {
    const bridge: DesktopPlatformBridge = {
      getCapabilities: vi.fn(async () => ok(caps)),
      clipboardReadText: vi.fn(async () => ok('clip')),
      clipboardWriteText: vi.fn(async () => ok(undefined)),
      fileOpenText: vi.fn(async () => ok({ content: 'open' })),
      fileSaveText: vi.fn(async () => ok({ content: 'save' })),
      fullscreenEnter: vi.fn(async () => ok(undefined)),
      fullscreenExit: vi.fn(async () => ok(undefined)),
      fullscreenIsActive: vi.fn(async () => ok(true)),
      protocolGetPendingInstallUrl: vi.fn(async () => ok('https://example.com')),
      externalLinkOpen: vi.fn(async () => ok(undefined)),
      secureStorageGet: vi.fn(async () => ok('secret')),
      secureStorageSet: vi.fn(async () => ok(undefined)),
      secureStorageDelete: vi.fn(async () => ok(undefined)),
      diagnosticsGetSnapshot: vi.fn(async () => ok({ platform: 'darwin' })),
      localServiceGetInfo: vi.fn(async () => ok({ running: true, host: '127.0.0.1', port: 123 })),
      networkFetchBytes: vi.fn(async () => ok(undefined)),
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
      externalLinkOpen: vi.fn(async () => ok(undefined)),
      secureStorageGet: async () => ok(undefined),
      secureStorageSet: async () => ok(undefined),
      secureStorageDelete: async () => ok(undefined),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes: async () => ok(undefined),
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const bad = await adapter.externalLinks.open('file:///etc/passwd');
    expect(bad.ok).toBe(false);
    expect(bridge.externalLinkOpen).not.toHaveBeenCalled();
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
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const r = await adapter.capabilities();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('platform.unexpected');
    }
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
      secureStorageGet: vi.fn(async () => ok(undefined)),
      secureStorageSet: vi.fn(async () => ok(undefined)),
      secureStorageDelete: vi.fn(async () => ok(undefined)),
      diagnosticsGetSnapshot: async () => ok({}),
      localServiceGetInfo: async () => ok({ running: false, host: null, port: null }),
      networkFetchBytes: async () => ok(undefined),
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
    };
    const adapter = createElectronPlatformAdapter(bridge);
    const r = await adapter.storage.getItem('reader.preference');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('platform.unsupported');
  });
});
