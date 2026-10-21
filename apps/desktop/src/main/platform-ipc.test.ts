import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@app/shared';
import { PLATFORM_IPC, detectElectronCapabilities } from '@app/platform';
import { registerPlatformIpc, toIpcAppResult, type PlatformIpcDeps } from './platform-ipc.js';

function fakeRequest(handler: (req: EventEmitter) => void) {
  return vi.fn<(options: { url?: string }) => EventEmitter>(() => {
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      abort: () => void;
    };
    req.end = () => {
      queueMicrotask(() => handler(req));
    };
    req.abort = () => {
      req.emit('close');
    };
    return req;
  });
}

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

  function register(overrides: Partial<PlatformIpcDeps> = {}) {
    const mock = createMockIpc();
    registerPlatformIpc({
      ipcMain: mock.ipcMain as never,
      getTargetWindow: () => null,
      dialog: {} as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
      ...overrides,
    });
    return mock.handlers;
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
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
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
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
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
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
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
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
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
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
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
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
    });
    await handlers.get(PLATFORM_IPC.FULLSCREEN_ENTER)!(null);
    await handlers.get(PLATFORM_IPC.FULLSCREEN_EXIT)!(null);
    expect(setFullScreen).toHaveBeenCalledWith(true);
    expect(setFullScreen).toHaveBeenCalledWith(false);
  });

  it('diagnostics snapshot strips error causes for IPC', async () => {
    const { ipcMain } = createMockIpc();
    registerPlatformIpc({
      ipcMain: ipcMain as never,
      getTargetWindow: () => null,
      dialog: {} as never,
      clipboard: { readText: () => '', writeText: () => {} } as never,
      shell: { openExternal: vi.fn<(url: string) => Promise<void>>() } as never,
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
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
      net: { request: vi.fn<() => void>() } as never,
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
      resolveHostAddresses: async () => ['93.184.216.34'],
    });
    const fn = handlers.get(PLATFORM_IPC.CLIPBOARD_WRITE_TEXT)!;
    const r = (await fn(null, 'x')) as ReturnType<typeof toIpcAppResult>;
    expect(r.ok).toBe(false);
  });

  it('rejects a save defaultPath outside a plain file name', async () => {
    const showSaveDialog = vi.fn<() => Promise<{ canceled: boolean; filePath?: string }>>(
      async () => ({ canceled: false, filePath: '/tmp/out.txt' }),
    );
    const writeFileUtf8 = vi.fn<(path: string, content: string) => Promise<void>>(async () => {});
    const handlers = register({
      dialog: { showSaveDialog } as never,
      writeFileUtf8,
    });

    const fn = handlers.get(PLATFORM_IPC.FILE_SAVE_TEXT)!;
    const r = (await fn(null, { content: 'x', defaultPath: '/etc/passwd' })) as ReturnType<
      typeof toIpcAppResult
    >;
    expect(r.ok).toBe(false);
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFileUtf8).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1/page.png',
    'http://localhost/page.png',
    'http://[::1]/page.png',
    'http://169.254.169.254/latest/meta-data',
    'http://10.1.2.3/page.png',
    'http://192.168.1.10/page.png',
    'file:///etc/passwd',
  ])('rejects network target %s before fetching', async (url) => {
    const request = vi.fn<() => void>();
    const handlers = register({ net: { request } as never });
    const fn = handlers.get(PLATFORM_IPC.NETWORK_FETCH_BYTES)!;

    const r = (await fn(null, url)) as ReturnType<typeof toIpcAppResult>;
    expect(r.ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private address', async () => {
    const request = vi.fn<() => void>();
    const handlers = register({
      net: { request } as never,
      resolveHostAddresses: async () => ['10.0.0.7'],
    });
    const fn = handlers.get(PLATFORM_IPC.NETWORK_FETCH_BYTES)!;

    const r = (await fn(null, 'https://internal.example/page.png')) as ReturnType<
      typeof toIpcAppResult
    >;
    expect(r.ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('settles a network fetch whose lookup never resolves', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn<() => void>();
      const handlers = register({
        net: { request } as never,
        resolveHostAddresses: () => new Promise<readonly string[]>(() => {}),
      });
      const fn = handlers.get(PLATFORM_IPC.NETWORK_FETCH_BYTES)!;
      let settled = false;
      const pending = fn(null, 'https://example.com/page.png').then((value) => {
        settled = true;
        return value;
      });

      await vi.advanceTimersByTimeAsync(59_999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const r = (await pending) as { ok: boolean; error?: { code?: string } };
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('platform.io-failed');
      expect(request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches a public hostname through net.request', async () => {
    const request = fakeRequest((req) => {
      // Electron 44: finish and close arrive before response.
      req.emit('finish');
      req.emit('close');
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = 200;
      res.headers = { 'content-type': 'image/png' };
      req.emit('response', res);
      res.emit('data', Buffer.from([1, 2, 3]));
      res.emit('end');
    });
    const handlers = register({ net: { request } as never });
    const fn = handlers.get(PLATFORM_IPC.NETWORK_FETCH_BYTES)!;

    const r = (await fn(null, 'https://example.com/page.png')) as {
      ok: boolean;
      value?: { data: ArrayBuffer; mimeType: string };
    };
    expect(r.ok).toBe(true);
    expect(r.value?.mimeType).toBe('image/png');
    expect(r.value?.data.byteLength).toBe(3);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      redirect: 'manual',
      method: 'GET',
      credentials: 'omit',
    });
  });

  it('rejects a redirect to a private host before requesting it', async () => {
    const request = fakeRequest((req) => {
      // Electron 44: finish and close arrive before the redirect.
      req.emit('finish');
      req.emit('close');
      req.emit('redirect', 302, 'GET', 'http://127.0.0.1/secret', {});
      req.emit('error', new Error('Redirect was cancelled'));
    });
    const handlers = register({ net: { request } as never });
    const fn = handlers.get(PLATFORM_IPC.NETWORK_FETCH_BYTES)!;

    const r = (await fn(null, 'https://example.com/page.png')) as {
      ok: boolean;
      value?: unknown;
    };
    expect(r.ok).toBe(true);
    expect(r.value).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('returns typed errors without leaking thrown details', async () => {
    const handlers = register({
      getCapabilities: () => {
        throw new Error('SECRET-CAPABILITY');
      },
    });
    const capabilities = (await handlers.get(PLATFORM_IPC.CAPABILITIES_GET)!(null)) as {
      ok: boolean;
      error?: { cause?: unknown };
    };
    expect(capabilities.ok).toBe(false);
    expect(JSON.stringify(capabilities)).not.toContain('SECRET');
    expect(capabilities.error?.cause).toBeUndefined();

    const clipboard = (await handlers.get(PLATFORM_IPC.CLIPBOARD_WRITE_TEXT)!(null, 42)) as {
      ok: boolean;
    };
    expect(clipboard.ok).toBe(false);
    expect(JSON.stringify(clipboard)).not.toContain('expected string');
  });
});
