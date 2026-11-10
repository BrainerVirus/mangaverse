import { describe, expect, it, vi } from 'vitest';
import { PLATFORM_IPC, TITLE_BAR_HEIGHT, WINDOW_CHROME_IPC } from '@app/platform';
import type { IpcMainInvokeEvent, TitleBarOverlayOptions, WebFrameMain } from 'electron';
import {
  WINDOW_CHROME_CHANNELS,
  WINDOW_CHROME_UNAUTHORIZED_FRAME,
  registerWindowChromeIpc,
  watchWindowChrome,
  type ChromeWindow,
} from './window-chrome-ipc.js';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const trusted = { url: 'app://app/' } as WebFrameMain;
const other = { url: 'https://evil.example/' } as WebFrameMain;

function fakeWindow(options: { fullScreen?: boolean; overlayThrows?: boolean } = {}) {
  const listeners = new Map<string, () => void>();
  let fullScreen = options.fullScreen ?? false;
  const send = vi.fn<(channel: string, ...args: unknown[]) => void>();
  const setTitleBarOverlay = vi.fn<(overlay: TitleBarOverlayOptions) => void>(() => {
    if (options.overlayThrows === true) throw new Error('C:\\secret\\path');
  });
  const window: ChromeWindow = {
    isDestroyed: () => false,
    isFullScreen: () => fullScreen,
    setTitleBarOverlay,
    on: (event, listener) => listeners.set(event, listener),
    webContents: { send },
  };
  return {
    window,
    send,
    setTitleBarOverlay,
    emit: (event: string, nowFullScreen: boolean) => {
      fullScreen = nowFullScreen;
      listeners.get(event)?.();
    },
  };
}

function register(platform: NodeJS.Platform, window: ChromeWindow | null) {
  const handlers = new Map<string, Handler>();
  registerWindowChromeIpc({
    ipcMain: { handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) },
    platform,
    isTrustedFrame: (frame): frame is WebFrameMain => frame === trusted,
    windowFor: () => window,
  });
  const invoke = (channel: string, frame: WebFrameMain | null, ...args: unknown[]) =>
    Promise.resolve(handlers.get(channel)!({ senderFrame: frame } as IpcMainInvokeEvent, ...args));
  return { handlers, invoke };
}

describe('window chrome IPC', () => {
  it('registers exactly the window chrome channels', () => {
    const { handlers } = register('darwin', null);
    expect([...handlers.keys()].sort()).toEqual([...WINDOW_CHROME_CHANNELS].sort());
  });

  it('Given the app frame, Then GET answers the platform, the fullscreen state and the strip height', async () => {
    const { invoke } = register('win32', fakeWindow({ fullScreen: true }).window);
    expect(await invoke(PLATFORM_IPC.WINDOW_CHROME_GET, trusted)).toEqual({
      ok: true,
      value: { platform: 'win32', fullScreen: true, height: TITLE_BAR_HEIGHT },
    });
  });

  it('Given another frame or no frame, Then both channels refuse and nothing is painted', async () => {
    const fake = fakeWindow();
    const { invoke } = register('linux', fake.window);
    for (const frame of [other, null]) {
      expect(await invoke(PLATFORM_IPC.WINDOW_CHROME_GET, frame)).toMatchObject({
        ok: false,
        error: { code: WINDOW_CHROME_UNAUTHORIZED_FRAME },
      });
      expect(
        await invoke(PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS, frame, '#000000', '#ffffff'),
      ).toMatchObject({ ok: false, error: { code: WINDOW_CHROME_UNAUTHORIZED_FRAME } });
    }
    expect(fake.setTitleBarOverlay).not.toHaveBeenCalled();
  });

  it.each(['win32', 'linux'] as const)(
    'Given %s and #rrggbb colours, Then the overlay is repainted at the strip height',
    async (platform) => {
      const fake = fakeWindow();
      const { invoke } = register(platform, fake.window);
      expect(
        await invoke(PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS, trusted, '#09090b', '#FAFAFA'),
      ).toEqual({ ok: true, value: undefined });
      expect(fake.setTitleBarOverlay).toHaveBeenCalledWith({
        color: '#09090b',
        symbolColor: '#FAFAFA',
        height: TITLE_BAR_HEIGHT,
      });
    },
  );

  it.each([
    ['oklch(0.2 0 0)', '#ffffff'],
    ['#000000', 'white'],
    ['#fff', '#000000'],
    ['#00000080', '#ffffff'],
    ['#000000; drop', '#ffffff'],
    [0, '#ffffff'],
  ])(
    'Given a colour that is not #rrggbb (%s, %s), Then it is refused and nothing is painted',
    async (color, symbolColor) => {
      const fake = fakeWindow();
      const { invoke } = register('win32', fake.window);
      expect(
        await invoke(PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS, trusted, color, symbolColor),
      ).toMatchObject({ ok: false, error: { code: 'platform.invalid-url' } });
      expect(fake.setTitleBarOverlay).not.toHaveBeenCalled();
    },
  );

  it('Given macOS, Then setting colours is a no-op that succeeds', async () => {
    const fake = fakeWindow();
    const { invoke } = register('darwin', fake.window);
    expect(
      await invoke(PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS, trusted, '#000000', '#ffffff'),
    ).toEqual({ ok: true, value: undefined });
    expect(fake.setTitleBarOverlay).not.toHaveBeenCalled();
  });

  it('Given the overlay throws, Then the renderer gets a typed error without the raw cause', async () => {
    const { invoke } = register('win32', fakeWindow({ overlayThrows: true }).window);
    const result = await invoke(
      PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS,
      trusted,
      '#000000',
      '#ffffff',
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'platform.io-failed', message: 'Could not paint the title bar.' },
    });
  });
});

describe('watchWindowChrome', () => {
  it('Given the window enters and leaves fullscreen, Then its page is told each time', () => {
    const fake = fakeWindow();
    watchWindowChrome(fake.window, 'darwin');
    fake.emit('enter-full-screen', true);
    fake.emit('leave-full-screen', false);
    expect(fake.send.mock.calls).toEqual([
      [WINDOW_CHROME_IPC, { platform: 'darwin', fullScreen: true, height: TITLE_BAR_HEIGHT }],
      [WINDOW_CHROME_IPC, { platform: 'darwin', fullScreen: false, height: TITLE_BAR_HEIGHT }],
    ]);
  });

  it("Given the page's own fullscreen ends inside the window's, Then the strip stays hidden", () => {
    const fake = fakeWindow();
    watchWindowChrome(fake.window, 'win32');
    fake.emit('enter-html-full-screen', true);
    fake.emit('leave-html-full-screen', true);
    fake.emit('leave-full-screen', false);
    expect(
      fake.send.mock.calls.map(([, chrome]) => (chrome as { fullScreen: boolean }).fullScreen),
    ).toEqual([true, true, false]);
  });
});
