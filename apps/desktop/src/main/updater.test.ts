import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLATFORM_IPC,
  UPDATE_AVAILABLE_IPC,
  UPDATE_STATE_IPC,
  type PlatformUpdateState,
} from '@app/platform';
import type { BrowserWindow, IpcMainInvokeEvent, WebFrameMain } from 'electron';

vi.mock('electron', () => ({ app: { isPackaged: false }, ipcMain: {} }));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));

const { registerAutoUpdate } = await import('./updater.js');
import type { UpdaterLike } from './updater.js';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const trusted = { url: 'app://app/library' } as WebFrameMain;
const untrusted = { url: 'https://evil.example/' } as WebFrameMain;

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = true;
  logger: unknown = console;
  checkForUpdates = vi.fn<() => Promise<{ downloadPromise?: Promise<unknown> | null } | null>>(
    async () => null,
  );
  quitAndInstall = vi.fn<() => void>();
}

class FakeSender extends EventEmitter {
  constructor(readonly id: number) {
    super();
  }
}

const handles: { stop(): void }[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.stop();
});

function setup(
  overrides: {
    isPackaged?: boolean;
    hasFeed?: boolean;
    useScriptUpdater?: boolean;
  } = {},
) {
  const handlers = new Map<string, Handler>();
  const updater = new FakeUpdater();
  // `send` sees only the install prompt; `sendAll` also sees the update-state events.
  const send = vi.fn<(channel: string, ...args: unknown[]) => void>();
  const sendAll = vi.fn<(channel: string, ...args: unknown[]) => void>();
  const log = vi.fn<(message: string) => void>();
  const window = {
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        sendAll(channel, ...args);
        if (channel === UPDATE_AVAILABLE_IPC) send(channel, ...args);
      },
    },
  } as unknown as BrowserWindow;
  const handle = registerAutoUpdate({
    ipcMain: {
      handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
      removeHandler: (channel: string) => void handlers.delete(channel),
    } as never,
    getPromptWindow: () => window,
    isTrustedFrame: (frame): frame is WebFrameMain => frame === trusted,
    isPackaged: overrides.isPackaged ?? true,
    currentVersion: '1.0.0',
    resourcesPath: '/resources',
    hasFeed: () => overrides.hasFeed ?? true,
    ...(overrides.useScriptUpdater
      ? { customUpdater: updater as unknown as UpdaterLike }
      : { updater: updater as unknown as UpdaterLike }),
    log,
  });
  handles.push(handle);
  const invoke = (
    channel: string,
    sender: FakeSender,
    frame: WebFrameMain = trusted,
    ...args: unknown[]
  ) => handlers.get(channel)!({ senderFrame: frame, sender } as never, ...args);
  return { handle, handlers, updater, send, sendAll, log, invoke };
}

const reading = (ctx: ReturnType<typeof setup>, sender: FakeSender, active: boolean) =>
  ctx.invoke(PLATFORM_IPC.UPDATE_SET_READER_ACTIVE, sender, trusted, active);

describe('registerAutoUpdate', () => {
  it.each([
    ['in dev or an unpackaged run', { isPackaged: false }],
    ['without a publish feed', { hasFeed: false }],
  ])('is disabled %s and only answers the state queries', (_label, overrides) => {
    const ctx = setup(overrides);
    expect(ctx.handle.enabled).toBe(false);
    expect([...ctx.handlers.keys()].sort()).toEqual([
      PLATFORM_IPC.UPDATE_CHECK_NOW,
      PLATFORM_IPC.UPDATE_GET_STATE,
    ]);
    expect(ctx.updater.listenerCount('update-downloaded')).toBe(0);
    expect(ctx.log).toHaveBeenCalledWith('disabled (not a packaged build with a publish feed)');
  });

  it('downloads in the background but never installs on quit', () => {
    const ctx = setup();
    expect(ctx.handle.enabled).toBe(true);
    expect(ctx.updater.autoDownload).toBe(true);
    expect(ctx.updater.autoInstallOnAppQuit).toBe(false);
  });

  it('enables the injected script updater without a publish feed', () => {
    const ctx = setup({ hasFeed: false, useScriptUpdater: true });
    expect(ctx.handle.enabled).toBe(true);
    expect(ctx.updater.autoDownload).toBe(true);
    expect(ctx.updater.autoInstallOnAppQuit).toBe(false);
    expect(ctx.updater.listenerCount('update-downloaded')).toBe(1);
    expect(ctx.log).toHaveBeenCalledWith('enabled');
  });

  it('prompts only once a release has downloaded', () => {
    const ctx = setup();
    ctx.updater.emit('update-available', { version: '1.2.0' });
    expect(ctx.send).not.toHaveBeenCalled();
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    expect(ctx.send).toHaveBeenCalledWith(UPDATE_AVAILABLE_IPC, { version: '1.2.0' });
  });

  it('refuses every channel from an untrusted frame', async () => {
    const ctx = setup();
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    const sender = new FakeSender(1);
    for (const [channel, args] of [
      [PLATFORM_IPC.UPDATE_SET_READER_ACTIVE, [true]],
      [PLATFORM_IPC.UPDATE_INSTALL, []],
      [PLATFORM_IPC.UPDATE_DISMISS, []],
    ] as const) {
      const result = await ctx.invoke(channel, sender, untrusted, ...args);
      expect(result).toMatchObject({ ok: false, error: { code: 'platform.permission-denied' } });
    }
    expect(ctx.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('holds the prompt while a window reads and shows it when reading ends', () => {
    const ctx = setup();
    const sender = new FakeSender(1);
    expect(reading(ctx, sender, true)).toEqual({ ok: true, value: undefined });
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    expect(ctx.send).not.toHaveBeenCalled();
    reading(ctx, sender, false);
    expect(ctx.send).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-boolean reading payload', () => {
    const ctx = setup();
    expect(reading(ctx, new FakeSender(1), 'yes' as never)).toMatchObject({ ok: false });
  });

  it('installs an accepted update immediately when nobody is reading', () => {
    const ctx = setup();
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    expect(ctx.invoke(PLATFORM_IPC.UPDATE_INSTALL, new FakeSender(1))).toMatchObject({ ok: true });
    expect(ctx.updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('installs an accepted update once, when the last reader leaves', () => {
    const ctx = setup();
    const promptWindow = new FakeSender(1);
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    const readerA = new FakeSender(2);
    const readerB = new FakeSender(3);
    reading(ctx, readerA, true);
    reading(ctx, readerB, true);
    expect(ctx.invoke(PLATFORM_IPC.UPDATE_INSTALL, promptWindow)).toMatchObject({ ok: true });
    expect(ctx.updater.quitAndInstall).not.toHaveBeenCalled();

    reading(ctx, readerA, false);
    expect(ctx.updater.quitAndInstall).not.toHaveBeenCalled();
    reading(ctx, readerB, false);
    expect(ctx.updater.quitAndInstall).toHaveBeenCalledTimes(1);

    reading(ctx, readerB, true);
    reading(ctx, readerB, false);
    ctx.invoke(PLATFORM_IPC.UPDATE_INSTALL, promptWindow);
    expect(ctx.updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('refuses to install when nothing has been offered', () => {
    const ctx = setup();
    expect(ctx.invoke(PLATFORM_IPC.UPDATE_INSTALL, new FakeSender(1))).toMatchObject({
      ok: false,
    });
    expect(ctx.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('a dismissed version is not offered again, but the ready update can still be installed', () => {
    const ctx = setup();
    const sender = new FakeSender(1);
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    expect(ctx.invoke(PLATFORM_IPC.UPDATE_DISMISS, sender)).toMatchObject({ ok: true });
    reading(ctx, sender, true);
    reading(ctx, sender, false);
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    expect(ctx.send).toHaveBeenCalledTimes(1);
    expect(ctx.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(ctx.invoke(PLATFORM_IPC.UPDATE_INSTALL, sender)).toMatchObject({ ok: true });
    expect(ctx.updater.quitAndInstall).toHaveBeenCalledTimes(1);

    ctx.updater.emit('update-downloaded', { version: '1.3.0' });
    expect(ctx.send).toHaveBeenLastCalledWith(UPDATE_AVAILABLE_IPC, { version: '1.3.0' });
  });

  it.each([
    ['a reload', (s: FakeSender) => s.emit('did-start-navigation', mainFrameLoad)],
    ['a reload that only restarts loading', (s: FakeSender) => s.emit('did-start-loading')],
    ['a crashed renderer', (s: FakeSender) => s.emit('render-process-gone', {}, {})],
    ['a closed window', (s: FakeSender) => s.emit('destroyed')],
  ])('%s mid-chapter stops the window counting as reading', (_label, end) => {
    const ctx = setup();
    const sender = new FakeSender(1);
    reading(ctx, sender, true);
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    expect(ctx.send).not.toHaveBeenCalled();
    end(sender);
    expect(ctx.send).toHaveBeenCalledTimes(1);
  });

  it('keeps counting a window that navigates within the same document', () => {
    const ctx = setup();
    const sender = new FakeSender(1);
    reading(ctx, sender, true);
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    sender.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it('watches each window once however often it opens a chapter', () => {
    const ctx = setup();
    const sender = new FakeSender(1);
    for (let i = 0; i < 3; i += 1) {
      reading(ctx, sender, true);
      reading(ctx, sender, false);
    }
    expect(sender.listenerCount('did-start-navigation')).toBe(1);
    expect(sender.listenerCount('destroyed')).toBe(1);
  });

  it('logs a failure from the updater exactly once', () => {
    const ctx = setup();
    const failure = new Error('net::ERR_INTERNET_DISCONNECTED');
    // electron-updater emits `error` and then rejects `checkForUpdates`; the rejection is
    // swallowed, so this event is the only record.
    ctx.updater.emit('error', failure);
    expect(ctx.log.mock.calls.filter(([m]) => m.includes('ERR_INTERNET'))).toEqual([
      ['Update failed: net::ERR_INTERNET_DISCONNECTED'],
    ]);
  });

  it('stop removes the handlers and the updater listeners', () => {
    const ctx = setup();
    ctx.handle.stop();
    expect(ctx.handlers.size).toBe(0);
    expect(ctx.updater.listenerCount('update-downloaded')).toBe(0);
    expect(ctx.updater.listenerCount('error')).toBe(0);
  });
});

const mainFrameLoad = { isMainFrame: true, isSameDocument: false };

describe('the update state', () => {
  const sender = new FakeSender(1);
  const states = (ctx: ReturnType<typeof setup>) =>
    ctx.sendAll.mock.calls
      .filter(([channel]) => channel === UPDATE_STATE_IPC)
      .map(([, state]) => state as PlatformUpdateState);
  const current = async (ctx: ReturnType<typeof setup>) =>
    (await ctx.invoke(PLATFORM_IPC.UPDATE_GET_STATE, sender)) as {
      ok: boolean;
      value: PlatformUpdateState;
    };

  it('Given an enabled updater, When the renderer asks, Then it gets idle with the current version', async () => {
    const ctx = setup();
    const result = await current(ctx);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      enabled: true,
      currentVersion: '1.0.0',
      lastCheckedAt: null,
      phase: { kind: 'idle' },
    });
  });

  it('Given updates are off in this build, Then it says so, and a check does nothing', async () => {
    const ctx = setup({ hasFeed: false });
    expect((await current(ctx)).value).toMatchObject({ enabled: false, phase: { kind: 'idle' } });
    const result = (await ctx.invoke(PLATFORM_IPC.UPDATE_CHECK_NOW, sender)) as {
      value: PlatformUpdateState;
    };
    expect(result.value.enabled).toBe(false);
    expect(ctx.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it.each([PLATFORM_IPC.UPDATE_GET_STATE, PLATFORM_IPC.UPDATE_CHECK_NOW])(
    'Given an untrusted frame, When it calls %s, Then it is refused',
    async (channel) => {
      const ctx = setup();
      const result = (await ctx.invoke(channel, sender, untrusted)) as { ok: boolean };
      expect(result.ok).toBe(false);
      expect(ctx.updater.checkForUpdates).not.toHaveBeenCalled();
    },
  );

  it('Given a release found, downloading and downloaded, Then each step reaches the renderer in order', () => {
    const ctx = setup();
    ctx.updater.emit('update-available', { version: '1.2.0' });
    ctx.updater.emit('download-progress', { percent: 40.4, transferred: 400, total: 1000 });
    ctx.updater.emit('download-progress', { percent: 40.9, transferred: 409, total: 1000 });
    ctx.updater.emit('download-progress', { percent: 100, transferred: 1000, total: 1000 });
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });

    expect(states(ctx).map((state) => state.phase)).toEqual([
      { kind: 'downloading', version: '1.2.0', percent: 0, transferred: 0, total: 0 },
      { kind: 'downloading', version: '1.2.0', percent: 40, transferred: 400, total: 1000 },
      { kind: 'downloading', version: '1.2.0', percent: 100, transferred: 1000, total: 1000 },
      { kind: 'ready', version: '1.2.0' },
    ]);
    // The install prompt is unchanged: it still appears once, when the bytes are on disk.
    expect(ctx.send).toHaveBeenCalledTimes(1);
  });

  it('Given an error with a path in it, Then the renderer gets a generic line and the log keeps the detail', () => {
    const ctx = setup();
    ctx.updater.emit('error', new Error("ENOENT: no such file, open '/Users/someone/secret'"));
    expect(states(ctx).at(-1)?.phase).toEqual({
      kind: 'error',
      message: 'The update could not be completed. Try again later.',
    });
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('/Users/someone/secret'));
  });

  it('Given check now, Then one check runs, the state is checking, and it ends idle with a time', async () => {
    const ctx = setup();
    let finish: () => void = () => {};
    ctx.updater.checkForUpdates.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(null);
        }),
    );

    const first = (await ctx.invoke(PLATFORM_IPC.UPDATE_CHECK_NOW, sender)) as {
      value: PlatformUpdateState;
    };
    expect(first.value.phase).toEqual({ kind: 'checking' });
    await ctx.invoke(PLATFORM_IPC.UPDATE_CHECK_NOW, sender);
    expect(ctx.updater.checkForUpdates).toHaveBeenCalledTimes(1);

    finish();
    await vi.waitFor(async () =>
      expect((await current(ctx)).value.phase).toEqual({ kind: 'idle' }),
    );
    expect((await current(ctx)).value.lastCheckedAt).not.toBeNull();
  });

  it('Given a check that failed but has not settled, When check now is pressed again, Then no second check starts', async () => {
    const ctx = setup();
    let settle: () => void = () => {};
    ctx.updater.checkForUpdates.mockImplementation(
      () => new Promise((resolve) => (settle = () => resolve(null))),
    );
    await ctx.invoke(PLATFORM_IPC.UPDATE_CHECK_NOW, sender);
    ctx.updater.emit('error', new Error('GitHub returned 503'));
    await ctx.invoke(PLATFORM_IPC.UPDATE_CHECK_NOW, sender);
    expect(ctx.updater.checkForUpdates).toHaveBeenCalledTimes(1);

    settle();
    await vi.waitFor(async () => expect((await current(ctx)).value.lastCheckedAt).not.toBeNull());
    expect((await current(ctx)).value.phase).toMatchObject({ kind: 'error' });
    await ctx.invoke(PLATFORM_IPC.UPDATE_CHECK_NOW, sender);
    expect(ctx.updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('Given an update that is ready, When check now is pressed, Then nothing is fetched again', async () => {
    const ctx = setup();
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    await ctx.invoke(PLATFORM_IPC.UPDATE_CHECK_NOW, sender);
    expect(ctx.updater.checkForUpdates).not.toHaveBeenCalled();
    expect((await current(ctx)).value.phase).toEqual({ kind: 'ready', version: '1.2.0' });
  });

  it('Given an accepted update, When it installs, Then the state is installing', async () => {
    const ctx = setup();
    ctx.updater.emit('update-downloaded', { version: '1.2.0' });
    await ctx.invoke(PLATFORM_IPC.UPDATE_INSTALL, sender);
    expect(ctx.updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(states(ctx).at(-1)?.phase).toEqual({ kind: 'installing', version: '1.2.0' });
  });

  it('Given the updater is stopped, Then its state handlers and listeners are removed', () => {
    const ctx = setup();
    ctx.handle.stop();
    expect(ctx.handlers.has(PLATFORM_IPC.UPDATE_GET_STATE)).toBe(false);
    expect(ctx.handlers.has(PLATFORM_IPC.UPDATE_CHECK_NOW)).toBe(false);
    expect(ctx.updater.listenerCount('update-available')).toBe(0);
    expect(ctx.updater.listenerCount('download-progress')).toBe(0);
  });
});
