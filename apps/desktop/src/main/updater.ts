/**
 * Auto-update wiring for the packaged desktop app (#215, spec 04 X7/X8).
 *
 * Checks run after startup and on a bounded interval, never on the startup path. The renderer
 * is asked before anything installs; a chapter that is open holds the prompt until it closes,
 * and a declined version is not offered again this session. Every failure is logged and
 * otherwise ignored. Development and unpackaged builds never register an updater.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  app,
  ipcMain as electronIpcMain,
  type BrowserWindow,
  type IpcMain,
  type IpcMainInvokeEvent,
  type WebFrameMain,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  PLATFORM_IPC,
  UPDATE_AVAILABLE_IPC,
  platformPermissionDenied,
  platformUnexpected,
  type PlatformUpdateInfo,
} from '@app/platform';
import type { AppResult } from '@app/shared';
import { err, ok } from '@app/shared';
import { createUpdatePromptController, runQuietUpdateCheck } from './update-policy.js';

/** Six hours: frequent enough to notice a release, quiet enough to leave the network alone. */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Delayed so a cold start is never waiting on the network. */
const UPDATE_INITIAL_DELAY_MS = 30 * 1000;

export interface RegisterAutoUpdateOptions {
  readonly ipcMain?: Pick<IpcMain, 'handle' | 'removeHandler'>;
  readonly getPromptWindow: () => BrowserWindow | null;
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
  readonly isPackaged?: boolean;
  readonly resourcesPath?: string;
  readonly log?: (message: string) => void;
}

export interface AutoUpdateHandle {
  readonly enabled: boolean;
  stop(): void;
}

function quietLog(message: string): void {
  // oxlint-disable-next-line no-console -- ruling: desktop-updater-log: an update failure has no renderer surface by design (it must never block startup), so main's log is the only record.
  // react-doctor-disable-next-line eslint/no-console -- ruling: desktop-updater-log: an update failure has no renderer surface by design (it must never block startup), so main's log is the only record.
  console.warn(`[updater] ${message}`);
}

export function registerAutoUpdate(options: RegisterAutoUpdateOptions): AutoUpdateHandle {
  const ipc = options.ipcMain ?? electronIpcMain;
  const log = options.log ?? quietLog;
  const isPackaged = options.isPackaged ?? app.isPackaged;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;

  // electron-updater must not run in dev, in an unpackaged run, or when the build carries
  // no publish feed: there is nothing to compare against and no app-update.yml to read.
  if (!isPackaged || !existsSync(join(resourcesPath, 'app-update.yml'))) {
    log('disabled (not a packaged build with a publish feed)');
    return { enabled: false, stop: () => {} };
  }

  let promptVersion: string | null = null;
  let readyVersion: string | null = null;
  let acceptedVersion: string | null = null;
  let stopped = false;
  const readerWindows = new Set<number>();
  const watchedWindows = new Set<number>();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  const controller = createUpdatePromptController({
    prompt: (version) => {
      promptVersion = version;
      const window = options.getPromptWindow();
      if (window === null || window.isDestroyed()) return;
      const info: PlatformUpdateInfo = { version };
      window.webContents.send(UPDATE_AVAILABLE_IPC, info);
    },
  });

  const installDownloaded = (version: string) => {
    if (stopped || readerWindows.size > 0) return;
    acceptedVersion = version;
    autoUpdater.quitAndInstall();
  };

  const handlers = {
    onAvailable: (info: { version: string }) => controller.setAvailable(info.version),
    onDownloaded: (info: { version: string }) => {
      readyVersion = info.version;
      if (acceptedVersion === info.version) installDownloaded(info.version);
    },
    onError: (error: Error) => log(`error: ${error.message}`),
  };
  autoUpdater.on('update-available', handlers.onAvailable);
  autoUpdater.on('update-downloaded', handlers.onDownloaded);
  autoUpdater.on('error', handlers.onError);

  const check = () => {
    if (stopped) return;
    void runQuietUpdateCheck(() => autoUpdater.checkForUpdates(), log);
  };

  const guard = (event: IpcMainInvokeEvent): AppResult<void> | null =>
    options.isTrustedFrame(event.senderFrame)
      ? null
      : err(platformPermissionDenied('This frame may not update the app.'));

  ipc.handle(PLATFORM_IPC.UPDATE_SET_READER_ACTIVE, (event, active: unknown) => {
    const denied = guard(event);
    if (denied !== null) return denied;
    if (typeof active !== 'boolean') {
      return err(platformUnexpected('Invalid reader-active payload.'));
    }
    if (active) {
      readerWindows.add(event.sender.id);
      if (!watchedWindows.has(event.sender.id)) {
        watchedWindows.add(event.sender.id);
        event.sender.once('destroyed', () => {
          watchedWindows.delete(event.sender.id);
          readerWindows.delete(event.sender.id);
          controller.setReaderCount(readerWindows.size);
        });
      }
    } else {
      readerWindows.delete(event.sender.id);
    }
    controller.setReaderCount(readerWindows.size);
    // An accepted download that finished while a chapter was open installs as soon as the
    // last reader leaves, instead of being dropped.
    if (readerWindows.size === 0 && acceptedVersion !== null && readyVersion === acceptedVersion) {
      installDownloaded(acceptedVersion);
    }
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
    if (readerWindows.size > 0) {
      return err(platformPermissionDenied('Finish reading before installing the update.'));
    }
    const version = promptVersion;
    if (version === null) {
      return err(platformUnexpected('No update is waiting to install.'));
    }
    if (readyVersion === version) {
      installDownloaded(version);
      return ok(undefined);
    }
    acceptedVersion = version;
    void runQuietUpdateCheck(() => autoUpdater.downloadUpdate(), log);
    return ok(undefined);
  });

  const initialTimer = setTimeout(check, UPDATE_INITIAL_DELAY_MS);
  initialTimer.unref?.();
  const intervalTimer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  intervalTimer.unref?.();

  log('enabled');

  return {
    enabled: true,
    stop: () => {
      stopped = true;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      autoUpdater.off('update-available', handlers.onAvailable);
      autoUpdater.off('update-downloaded', handlers.onDownloaded);
      autoUpdater.off('error', handlers.onError);
      ipc.removeHandler(PLATFORM_IPC.UPDATE_SET_READER_ACTIVE);
      ipc.removeHandler(PLATFORM_IPC.UPDATE_INSTALL);
      ipc.removeHandler(PLATFORM_IPC.UPDATE_DISMISS);
    },
  };
}
