import { describe, expect, it, vi } from 'vitest';
import { ok } from '@app/shared';
import { PLATFORM_IPC, detectElectronCapabilities } from '@app/platform';
import { registerPlatformIpc, toIpcAppResult } from './platform-ipc.js';

describe('registerPlatformIpc', () => {
  function createMockIpc() {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    const ipcMain = {
      handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
        handlers.set(channel, fn);
      },
    };
    return { ipcMain, handlers };
  }

  it('registers every expected IPC channel', () => {
    const { ipcMain, handlers } = createMockIpc();
    const fakeWin = {
      setFullScreen: vi.fn<(value: boolean) => void>(),
      isFullScreen: vi.fn<() => boolean>(() => false),
    };
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => fakeWin as never,
      dialog: {} as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8: vi.fn<(path: string, content: string) => Promise<void>>(),
      getCapabilities: () => detectElectronCapabilities({ secureStorage: true }),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({}),
    });

    const expected = new Set(Object.values(PLATFORM_IPC));
    expect(handlers.size).toBe(expected.size);
    for (const ch of expected) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  it('rejects unsafe external URL', async () => {
    const { ipcMain, handlers } = createMockIpc();
    const shell = { openExternal: vi.fn<(url: string) => Promise<void>>() };
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => null,
      dialog: {} as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: shell as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8: vi.fn<(path: string, content: string) => Promise<void>>(),
      getCapabilities: () => detectElectronCapabilities(),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({}),
    });
    const fn = handlers.get(PLATFORM_IPC.EXTERNAL_LINK_OPEN)!;
    const r = (await fn(null, 'file:///x')) as ReturnType<typeof toIpcAppResult>;
    expect(r.ok).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('opens safe external URL through injected shell', async () => {
    const { ipcMain, handlers } = createMockIpc();
    const shell = { openExternal: vi.fn<(url: string) => Promise<void>>(async () => {}) };
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => null,
      dialog: {} as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: shell as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8: vi.fn<(path: string, content: string) => Promise<void>>(),
      getCapabilities: () => detectElectronCapabilities(),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({}),
    });
    const fn = handlers.get(PLATFORM_IPC.EXTERNAL_LINK_OPEN)!;
    const r = (await fn(null, 'https://example.com')) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('saves text only to selected path', async () => {
    const { ipcMain, handlers } = createMockIpc();
    const writeFileUtf8 = vi.fn<(path: string, content: string) => Promise<void>>(async () => {});
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => null,
      dialog: {
        showSaveDialog: vi.fn<() => Promise<{ canceled: boolean; filePath?: string }>>(
          async () => ({ canceled: false, filePath: '/tmp/out.txt' }),
        ),
      } as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8,
      getCapabilities: () => detectElectronCapabilities(),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({}),
    });
    const fn = handlers.get(PLATFORM_IPC.FILE_SAVE_TEXT)!;
    const r = (await fn(null, { content: 'hello', suggestedName: 'a.txt' })) as {
      ok: boolean;
      value?: { path?: string; content: string };
    };
    expect(r.ok).toBe(true);
    expect(writeFileUtf8).toHaveBeenCalledWith('/tmp/out.txt', 'hello');
  });

  it('returns cancellation when save dialog is cancelled', async () => {
    const { ipcMain, handlers } = createMockIpc();
    const writeFileUtf8 = vi.fn<(path: string, content: string) => Promise<void>>();
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => null,
      dialog: {
        showSaveDialog: vi.fn<() => Promise<{ canceled: boolean; filePath?: string }>>(
          async () => ({ canceled: true, filePath: undefined }),
        ),
      } as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8,
      getCapabilities: () => detectElectronCapabilities(),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({}),
    });
    const fn = handlers.get(PLATFORM_IPC.FILE_SAVE_TEXT)!;
    const r = (await fn(null, { content: 'x' })) as {
      ok: boolean;
      value?: { cancelled?: boolean };
    };
    expect(r.ok).toBe(true);
    expect(r.value?.cancelled).toBe(true);
    expect(writeFileUtf8).not.toHaveBeenCalled();
  });

  it('fullscreen handlers call the injected window', async () => {
    const { ipcMain, handlers } = createMockIpc();
    const setFullScreen = vi.fn<(value: boolean) => void>();
    const fakeWin = { setFullScreen, isFullScreen: () => true };
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => fakeWin as never,
      dialog: {} as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8: vi.fn<(path: string, content: string) => Promise<void>>(),
      getCapabilities: () => detectElectronCapabilities(),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({}),
    });
    await handlers.get(PLATFORM_IPC.FULLSCREEN_ENTER)!(null);
    await handlers.get(PLATFORM_IPC.FULLSCREEN_EXIT)!(null);
    expect(setFullScreen).toHaveBeenCalledWith(true);
    expect(setFullScreen).toHaveBeenCalledWith(false);
  });

  it('diagnostics snapshot strips error causes for IPC', async () => {
    const { ipcMain, handlers } = createMockIpc();
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => null,
      dialog: {} as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8: vi.fn<(path: string, content: string) => Promise<void>>(),
      getCapabilities: () => detectElectronCapabilities(),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({
        nodeVersion: '22',
      }),
    });
    const wrapped = toIpcAppResult({
      ok: false,
      error: {
        code: 'x',
        message: 'm',
        cause: new Error('SECRET'),
      },
    });
    expect(JSON.stringify(wrapped.error).includes('SECRET')).toBe(false);
  });

  // Electron 44's clipboard.writeText returns a promise; without the await the
  // handler reported success even when the write rejected.
  it('reports a clipboard write failure instead of success', async () => {
    const { ipcMain, handlers } = createMockIpc();
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => null,
      dialog: {} as never,
      clipboard: {
        readText: () => '',
        writeText: async () => {
          throw new Error('denied');
        },
      } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() } as never,
      readFileUtf8: vi.fn<(path: string) => Promise<string>>(),
      writeFileUtf8: vi.fn<(path: string, content: string) => Promise<void>>(),
      getCapabilities: () => detectElectronCapabilities(),
      protocolTakePendingInstallUrl: () => null,
      secureStorage: {
        get: async () => ok(undefined),
        set: async () => ok(undefined),
        delete: async () => ok(undefined),
      },
      getLocalServiceInfo: () => ({ running: false, host: null, port: null }),
      buildDiagnosticsSnapshot: () => ({}),
    });
    const fn = handlers.get(PLATFORM_IPC.CLIPBOARD_WRITE_TEXT)!;
    const r = (await fn(null, 'x')) as ReturnType<typeof toIpcAppResult>;
    expect(r.ok).toBe(false);
  });
});
