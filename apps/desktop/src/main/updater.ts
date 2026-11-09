/**
 * Auto-update wiring for the packaged desktop app (#215, spec 04 X7/X8).
 *
 * Checks run after startup and on a bounded interval, never on the startup path. A found
 * release downloads in the background; only once it is on disk does main ask the renderer,
 * and nothing installs until the user accepts. A chapter that is open holds both the prompt
 * and an accepted install until reading ends, and a declined version is not offered again
 * this session. Every failure is logged once and otherwise ignored. Development and
 * unpackaged builds never register an updater; a build without a publish feed registers only
 * the injected nightly script updater.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  app,
  ipcMain as electronIpcMain,
  type BrowserWindow,
  type IpcMain,
  type IpcMainInvokeEvent,
  type WebContents,
  type WebFrameMain,
} from 'electron';
import { autoUpdater as electronAutoUpdater } from 'electron-updater';
import {
  PLATFORM_IPC,
  UPDATE_AVAILABLE_IPC,
  UPDATE_STATE_IPC,
  platformPermissionDenied,
  platformUnexpected,
  type PlatformUpdateInfo,
} from '@app/platform';
import type { AppResult } from '@app/shared';
import { err, ok } from '@app/shared';
import { createUpdatePromptController, runQuietUpdateCheck } from './update-policy.js';
import { createUpdateState } from './update-state.js';
import type { UpdateCheckResult } from './update-policy.js';

/** Six hours: frequent enough to notice a release, quiet enough to leave the network alone. */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Delayed so a cold start is never waiting on the network. */
const UPDATE_INITIAL_DELAY_MS = 30 * 1000;

/** Download progress, shaped like electron-updater's `download-progress` payload. */
export interface UpdateProgress {
  /** 0-100; 0 while the size is unknown. */
  readonly percent: number;
  readonly transferred: number;
  /** Bytes in the release; 0 when the server did not say. */
  readonly total: number;
}

/** The slice of electron-updater's `autoUpdater` this module drives (injectable for tests). */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown;
  on(event: 'download-progress', listener: (progress: UpdateProgress) => void): unknown;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'update-available', listener: (info: { version: string }) => void): unknown;
  off(event: 'download-progress', listener: (progress: UpdateProgress) => void): unknown;
  off(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<UpdateCheckResult | null>;
  quitAndInstall(): void;
  /** Releases anything held for an update that was never installed (a staged download). */
  dispose?(): void;
}

export interface RegisterAutoUpdateOptions {
  readonly ipcMain?: Pick<IpcMain, 'handle' | 'removeHandler'>;
  readonly getPromptWindow: () => BrowserWindow | null;
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
  readonly isPackaged?: boolean;
  /** Shown in the update state; defaults to the running app's version. */
  readonly currentVersion?: string;
  readonly resourcesPath?: string;
  readonly hasFeed?: (resourcesPath: string) => boolean;
  readonly updater?: UpdaterLike;
  /** Nightly script updater; enables updates without an app-update.yml feed. */
  readonly customUpdater?: UpdaterLike;
  readonly log?: (message: string) => void;
}

export interface AutoUpdateHandle {
  readonly enabled: boolean;
  stop(): void;
}

/** The updater's log line (also given to the script updater): main's console is its only record. */
export function quietLog(message: string): void {
  // oxlint-disable-next-line no-console -- ruling: desktop-updater-log: an update failure has no renderer surface by design (it must never block startup), so main's log is the only record.
  // react-doctor-disable-next-line eslint/no-console -- ruling: desktop-updater-log: an update failure has no renderer surface by design (it must never block startup), so main's log is the only record.
  console.warn(`[updater] ${message}`);
}

export function registerAutoUpdate(options: RegisterAutoUpdateOptions): AutoUpdateHandle {
  const ipc = options.ipcMain ?? electronIpcMain;
  const log = options.log ?? quietLog;
  const isPackaged = options.isPackaged ?? app.isPackaged;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const hasFeed = options.hasFeed ?? ((path) => existsSync(join(path, 'app-update.yml')));

  // electron-updater must not run in dev, in an unpackaged run, or when the build carries
  // no publish feed: there is nothing to compare against and no app-update.yml to read.
  const enabled = isPackaged && (hasFeed(resourcesPath) || options.customUpdater !== undefined);

  const state = createUpdateState({
    enabled,
    currentVersion: options.currentVersion ?? app.getVersion(),
    publish: (next) => {
      const window = options.getPromptWindow();
      if (window === null || window.isDestroyed()) return;
      window.webContents.send(UPDATE_STATE_IPC, next);
    },
  });
  const guard = (event: IpcMainInvokeEvent): AppResult<void> | null =>
    options.isTrustedFrame(event.senderFrame)
      ? null
      : err(platformPermissionDenied('This frame may not update the app.'));
  // Answered even when updates are off, so the renderer can say so instead of failing to ask.
  ipc.handle(PLATFORM_IPC.UPDATE_GET_STATE, (event) => guard(event) ?? ok(state.get()));

  if (!enabled) {
    log('disabled (not a packaged build with a publish feed)');
    ipc.handle(PLATFORM_IPC.UPDATE_CHECK_NOW, (event) => guard(event) ?? ok(state.get()));
    return {
      enabled: false,
      stop: () => {
        ipc.removeHandler(PLATFORM_IPC.UPDATE_GET_STATE);
        ipc.removeHandler(PLATFORM_IPC.UPDATE_CHECK_NOW);
      },
    };
  }

  const updater =
    options.updater ?? options.customUpdater ?? (electronAutoUpdater as unknown as UpdaterLike);
  let promptVersion: string | null = null;
  let accepted = false;
  let installing = false;
  let stopped = false;
  const readerWindows = new Set<number>();
  const watchedWindows = new Set<number>();

  // Download in the background so the prompt can honestly say "ready"; installing still
  // waits for the user, and never happens implicitly on quit.
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.logger = null;

  const controller = createUpdatePromptController({
    prompt: (version) => {
      promptVersion = version;
      const window = options.getPromptWindow();
      if (window === null || window.isDestroyed()) return;
      const info: PlatformUpdateInfo = { version };
      window.webContents.send(UPDATE_AVAILABLE_IPC, info);
    },
  });

  const install = () => {
    if (stopped || installing || readerWindows.size > 0) return;
    installing = true;
    state.installing(false);
    updater.quitAndInstall();
  };

  const setReaderCount = () => {
    // Once the install is accepted a deferred prompt would only flash before the restart.
    if (!accepted) controller.setReaderCount(readerWindows.size);
    // An install accepted while another window was reading runs once the last reader leaves.
    if (readerWindows.size === 0 && accepted) install();
  };

  const handlers = {
    onFound: (info: { version: string }) => state.found(info.version),
    onProgress: (progress: UpdateProgress) => state.progress(progress),
    onDownloaded: (info: { version: string }) => {
      state.ready(info.version);
      controller.setAvailable(info.version);
    },
    onError: (error: Error) => {
      log(`Update failed: ${error.message}`);
      state.failed(error);
      // A failure cancels an install that was only queued behind a chapter, and the prompt
      // controller hears about readers again.
      if (accepted && !installing) {
        accepted = false;
        controller.setReaderCount(readerWindows.size);
      }
    },
  };
  updater.on('update-available', handlers.onFound);
  updater.on('download-progress', handlers.onProgress);
  updater.on('update-downloaded', handlers.onDownloaded);
  updater.on('error', handlers.onError);

  // One check at a time, and none while an update is downloading, ready or installing.
  // A failed check can end (phase `error`) before its promise settles, so the in-flight flag,
  // not the phase, decides whether a retry may start; otherwise the old check's end would reset
  // the new one's state.
  let checkInFlight = false;
  const check = (): Promise<void> => {
    if (stopped || checkInFlight || !state.startCheck()) return Promise.resolve();
    checkInFlight = true;
    return runQuietUpdateCheck(() => updater.checkForUpdates()).finally(() => {
      checkInFlight = false;
      state.finishCheck();
    });
  };

  ipc.handle(PLATFORM_IPC.UPDATE_CHECK_NOW, (event) => {
    const denied = guard(event);
    if (denied !== null) return denied;
    // The check runs on; progress reaches the renderer through the state events.
    void check();
    return ok(state.get());
  });

  // A reload, a full navigation, a crashed renderer or a closed window ends that window's
  // reading: the new document has not opened a chapter, so it must not hold the update.
  const watch = (sender: WebContents) => {
    const id = sender.id;
    if (watchedWindows.has(id)) return;
    watchedWindows.add(id);
    const leave = () => {
      if (!readerWindows.delete(id)) return;
      setReaderCount();
    };
    sender.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) leave();
    });
    // Covers a reload that never produces a navigation (for example a renderer restart
    // that re-runs the same document load).
    sender.on('did-start-loading', leave);
    sender.on('render-process-gone', leave);
    sender.once('destroyed', () => {
      watchedWindows.delete(id);
      leave();
    });
  };

  ipc.handle(PLATFORM_IPC.UPDATE_SET_READER_ACTIVE, (event, active: unknown) => {
    const denied = guard(event);
    if (denied !== null) return denied;
    if (typeof active !== 'boolean') {
      return err(platformUnexpected('Invalid reader-active payload.'));
    }
    if (active) {
      watch(event.sender);
      readerWindows.add(event.sender.id);
    } else {
      readerWindows.delete(event.sender.id);
    }
    setReaderCount();
    return ok(undefined);
  });

  ipc.handle(PLATFORM_IPC.UPDATE_DISMISS, (event) => {
    const denied = guard(event);
    if (denied !== null) return denied;
    if (promptVersion !== null) controller.decline(promptVersion);
    promptVersion = null;
    return ok(undefined);
  });

  ipc.handle(PLATFORM_IPC.UPDATE_INSTALL, (event) => {
    const denied = guard(event);
    if (denied !== null) return denied;
    // Only a release that finished downloading is `ready`, so that is the one on disk. Saying
    // "Later" to the prompt does not take it away: the title-bar button can still install it.
    if (state.get().phase.kind !== 'ready') {
      return err(platformUnexpected('No update is waiting to install.'));
    }
    accepted = true;
    // A chapter is open somewhere: say the restart is queued, and run it when reading ends.
    if (readerWindows.size > 0) state.installing(true);
    else install();
    return ok(undefined);
  });

  const initialTimer = setTimeout(() => void check(), UPDATE_INITIAL_DELAY_MS);
  initialTimer.unref?.();
  const intervalTimer = setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
  intervalTimer.unref?.();

  log('enabled');

  return {
    enabled: true,
    stop: () => {
      stopped = true;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      updater.off('update-available', handlers.onFound);
      updater.off('download-progress', handlers.onProgress);
      updater.off('update-downloaded', handlers.onDownloaded);
      updater.off('error', handlers.onError);
      updater.dispose?.();
      ipc.removeHandler(PLATFORM_IPC.UPDATE_SET_READER_ACTIVE);
      ipc.removeHandler(PLATFORM_IPC.UPDATE_INSTALL);
      ipc.removeHandler(PLATFORM_IPC.UPDATE_DISMISS);
      ipc.removeHandler(PLATFORM_IPC.UPDATE_GET_STATE);
      ipc.removeHandler(PLATFORM_IPC.UPDATE_CHECK_NOW);
    },
  };
}
