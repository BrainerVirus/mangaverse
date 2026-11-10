import { createAppError, err, ok, type AppResult } from '@app/shared';
import {
  PLATFORM_IPC,
  WINDOW_CHROME_IPC,
  titleBarHeight,
  platformInvalidUrl,
  platformIoFailed,
  platformIpcRequestSchema,
  type PlatformWindowChrome,
} from '@app/platform';
import type { IpcMain, IpcMainInvokeEvent, TitleBarOverlayOptions, WebFrameMain } from 'electron';
import { toIpcAppResult } from './platform-ipc.js';
import { windowChromePlatform } from './window-chrome.js';

export const WINDOW_CHROME_UNAUTHORIZED_FRAME = 'window-chrome.unauthorized_frame';

/** Registered here, with sender authorization, rather than by `registerPlatformIpc`. */
export const WINDOW_CHROME_CHANNELS = [
  PLATFORM_IPC.WINDOW_CHROME_GET,
  PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS,
] as const;

type FullScreenEvent =
  | 'enter-full-screen'
  | 'leave-full-screen'
  | 'enter-html-full-screen'
  | 'leave-html-full-screen';

/** The part of a `BrowserWindow` the title bar touches. */
export interface ChromeWindow {
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  setTitleBarOverlay(options: TitleBarOverlayOptions): void;
  on(event: FullScreenEvent, listener: () => void): unknown;
  readonly webContents: { send(channel: string, ...args: unknown[]): void };
}

export interface WindowChromeIpcDeps {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly platform: NodeJS.Platform;
  /** The data host's check: the main frame of a window main created, on the app's origin. */
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
  /** The window whose page sent the request. */
  readonly windowFor: (event: IpcMainInvokeEvent) => ChromeWindow | null;
}

function chromeOf(platform: NodeJS.Platform, fullScreen: boolean): PlatformWindowChrome {
  const chromePlatform = windowChromePlatform(platform);
  return { platform: chromePlatform, fullScreen, height: titleBarHeight(chromePlatform) };
}

export function registerWindowChromeIpc(deps: WindowChromeIpcDeps): void {
  const refuse = () =>
    toIpcAppResult(
      err(
        createAppError({
          code: WINDOW_CHROME_UNAUTHORIZED_FRAME,
          message: 'This frame may not draw the title bar.',
        }),
      ),
    );

  deps.ipcMain.handle(
    PLATFORM_IPC.WINDOW_CHROME_GET,
    (event: IpcMainInvokeEvent, ...args: unknown[]): AppResult<PlatformWindowChrome> => {
      if (!deps.isTrustedFrame(event.senderFrame)) return refuse();
      const parsed = platformIpcRequestSchema.safeParse({
        channel: PLATFORM_IPC.WINDOW_CHROME_GET,
        args,
      });
      if (!parsed.success) {
        return toIpcAppResult(err(platformInvalidUrl('IPC request payload is invalid.')));
      }
      const window = deps.windowFor(event);
      const fullScreen = window !== null && !window.isDestroyed() && window.isFullScreen();
      return ok(chromeOf(deps.platform, fullScreen));
    },
  );

  deps.ipcMain.handle(
    PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS,
    (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<AppResult<void>> => {
      if (!deps.isTrustedFrame(event.senderFrame)) return Promise.resolve(refuse());
      const parsed = platformIpcRequestSchema.safeParse({
        channel: PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS,
        args,
      });
      const request = parsed.success ? parsed.data : null;
      if (request?.channel !== PLATFORM_IPC.WINDOW_SET_TITLE_BAR_COLORS) {
        return Promise.resolve(toIpcAppResult(err(platformInvalidUrl('Colours must be #rrggbb.'))));
      }
      // macOS has no overlay: the traffic lights keep the system's own colours.
      if (windowChromePlatform(deps.platform) === 'darwin') return Promise.resolve(ok(undefined));
      const window = deps.windowFor(event);
      if (window === null || window.isDestroyed()) return Promise.resolve(ok(undefined));
      const [color, symbolColor] = request.args;
      // A failed repaint keeps the previous colours; the renderer is told, nothing throws.
      return Promise.resolve()
        .then(() =>
          window.setTitleBarOverlay({
            color,
            symbolColor,
            height: titleBarHeight(windowChromePlatform(deps.platform)),
          }),
        )
        .then(
          () => ok(undefined),
          (cause: unknown) =>
            toIpcAppResult(err(platformIoFailed('Could not paint the title bar.', cause))),
        );
    },
  );
}

/**
 * Tells the window's page when it enters or leaves fullscreen, the window's own (green button,
 * F11) or the page's (the reader's DOM fullscreen): the native controls go away, so the strip does.
 */
export function watchWindowChrome(window: ChromeWindow, platform: NodeJS.Platform): void {
  const publish = (fullScreen: boolean) => {
    if (window.isDestroyed()) return;
    window.webContents.send(WINDOW_CHROME_IPC, chromeOf(platform, fullScreen));
  };
  window.on('enter-full-screen', () => publish(true));
  window.on('leave-full-screen', () => publish(false));
  window.on('enter-html-full-screen', () => publish(true));
  // Leaving the page's fullscreen can land back in the window's own.
  window.on('leave-html-full-screen', () => publish(window.isFullScreen()));
}
