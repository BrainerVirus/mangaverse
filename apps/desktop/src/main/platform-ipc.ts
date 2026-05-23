import { err, ok, type AppError, type AppResult } from '@app/shared';
import type { BrowserWindow, Clipboard, Dialog, IpcMain, SaveDialogOptions, Shell } from 'electron';
import {
  PLATFORM_IPC,
  isSafeExternalUrl,
  isValidSecureStorageKey,
  platformInvalidUrl,
  platformIoFailed,
  platformPermissionDenied,
  type LocalServiceInfo,
  type PlatformCapabilities,
  type PlatformDiagnosticsSnapshot,
  type PlatformFileOpenOptions,
  type PlatformFileSaveOptions,
} from '@app/platform';

export function toIpcAppResult<T>(r: AppResult<T>): AppResult<T> {
  if (r.ok) {
    return r;
  }
  const e: AppError = r.error;
  return {
    ok: false,
    error: {
      code: e.code,
      message: e.message,
      ...(e.details !== undefined ? { details: e.details } : {}),
      ...(e.retryable !== undefined ? { retryable: e.retryable } : {}),
      ...(e.providerId !== undefined ? { providerId: e.providerId } : {}),
    },
  };
}

export interface SecureStorageHandlers {
  get(key: string): Promise<AppResult<string | undefined>>;
  set(key: string, value: string): Promise<AppResult<void>>;
  delete(key: string): Promise<AppResult<void>>;
}

export interface PlatformIpcDeps {
  readonly ipcMain: IpcMain;
  readonly getTargetWindow: () => BrowserWindow | null;
  readonly dialog: Dialog;
  readonly clipboard: Clipboard;
  readonly shell: Shell;
  readonly readFileUtf8: (path: string) => Promise<string>;
  readonly writeFileUtf8: (path: string, content: string) => Promise<void>;
  readonly getCapabilities: () => PlatformCapabilities;
  readonly protocolTakePendingInstallUrl: () => string | null;
  readonly secureStorage: SecureStorageHandlers;
  readonly getLocalServiceInfo: () => LocalServiceInfo;
  readonly buildDiagnosticsSnapshot: () => PlatformDiagnosticsSnapshot;
}

export function registerPlatformIpc(deps: PlatformIpcDeps): void {
  const { ipcMain } = deps;

  ipcMain.handle(PLATFORM_IPC.CAPABILITIES_GET, async () =>
    toIpcAppResult(ok(deps.getCapabilities())),
  );

  ipcMain.handle(PLATFORM_IPC.CLIPBOARD_READ_TEXT, async () => {
    try {
      return toIpcAppResult(ok(deps.clipboard.readText()));
    } catch {
      return toIpcAppResult(err(platformPermissionDenied('Could not read clipboard.')));
    }
  });

  ipcMain.handle(PLATFORM_IPC.CLIPBOARD_WRITE_TEXT, async (_e, text: string) => {
    if (typeof text !== 'string') {
      return toIpcAppResult(err(platformInvalidUrl('Clipboard payload invalid.')));
    }
    try {
      deps.clipboard.writeText(text);
      return toIpcAppResult(ok(undefined));
    } catch {
      return toIpcAppResult(err(platformPermissionDenied('Could not write clipboard.')));
    }
  });

  ipcMain.handle(
    PLATFORM_IPC.FILE_OPEN_TEXT,
    async (_e, options: PlatformFileOpenOptions | undefined) => {
      const win = deps.getTargetWindow();
      const picked = win
        ? await deps.dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [
              { name: 'Text', extensions: ['txt', 'md', 'json'] },
              { name: 'All Files', extensions: ['*'] },
            ],
            ...(options?.suggestedName ? { defaultPath: options.suggestedName } : {}),
          })
        : await deps.dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
              { name: 'Text', extensions: ['txt', 'md', 'json'] },
              { name: 'All Files', extensions: ['*'] },
            ],
            ...(options?.suggestedName ? { defaultPath: options.suggestedName } : {}),
          });
      if (picked.canceled || picked.filePaths[0] === undefined) {
        return toIpcAppResult(ok({ content: '', cancelled: true }));
      }
      const path = picked.filePaths[0];
      try {
        const content = await deps.readFileUtf8(path);
        return toIpcAppResult(ok({ path, content }));
      } catch (e) {
        return toIpcAppResult(err(platformIoFailed('Could not read file.', e)));
      }
    },
  );

  ipcMain.handle(
    PLATFORM_IPC.FILE_SAVE_TEXT,
    async (_e, options: PlatformFileSaveOptions | undefined) => {
      if (!options || typeof options.content !== 'string') {
        return toIpcAppResult(err(platformInvalidUrl('Save options are invalid.')));
      }
      const win = deps.getTargetWindow();
      const saveOpts: SaveDialogOptions = {
        filters: [
          { name: 'Text', extensions: ['txt', 'md', 'json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      };
      if (options.defaultPath !== undefined) {
        saveOpts.defaultPath = options.defaultPath;
      } else if (options.suggestedName !== undefined) {
        saveOpts.defaultPath = options.suggestedName;
      }
      const picked = win
        ? await deps.dialog.showSaveDialog(win, saveOpts)
        : await deps.dialog.showSaveDialog(saveOpts);
      if (picked.canceled || picked.filePath === undefined) {
        return toIpcAppResult(ok({ content: options.content, cancelled: true }));
      }
      try {
        await deps.writeFileUtf8(picked.filePath, options.content);
        return toIpcAppResult(ok({ path: picked.filePath, content: options.content }));
      } catch (e) {
        return toIpcAppResult(err(platformIoFailed('Could not write file.', e)));
      }
    },
  );

  ipcMain.handle(PLATFORM_IPC.FULLSCREEN_ENTER, async () => {
    const win = deps.getTargetWindow();
    if (!win) {
      return toIpcAppResult(err(platformPermissionDenied('No active window for fullscreen.')));
    }
    try {
      win.setFullScreen(true);
      return toIpcAppResult(ok(undefined));
    } catch (e) {
      return toIpcAppResult(err(platformIoFailed('Could not enter fullscreen.', e)));
    }
  });

  ipcMain.handle(PLATFORM_IPC.FULLSCREEN_EXIT, async () => {
    const win = deps.getTargetWindow();
    if (!win) {
      return toIpcAppResult(err(platformPermissionDenied('No active window for fullscreen.')));
    }
    try {
      win.setFullScreen(false);
      return toIpcAppResult(ok(undefined));
    } catch (e) {
      return toIpcAppResult(err(platformIoFailed('Could not exit fullscreen.', e)));
    }
  });

  ipcMain.handle(PLATFORM_IPC.FULLSCREEN_IS_ACTIVE, async () => {
    const win = deps.getTargetWindow();
    if (!win) {
      return toIpcAppResult(ok(false));
    }
    return toIpcAppResult(ok(win.isFullScreen()));
  });

  ipcMain.handle(PLATFORM_IPC.EXTERNAL_LINK_OPEN, async (_e, url: unknown) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      return toIpcAppResult(err(platformInvalidUrl('Only http and https URLs are allowed.')));
    }
    try {
      await deps.shell.openExternal(url);
      return toIpcAppResult(ok(undefined));
    } catch (e) {
      return toIpcAppResult(err(platformIoFailed('Could not open external link.', e)));
    }
  });

  ipcMain.handle(PLATFORM_IPC.PROTOCOL_GET_PENDING_INSTALL_URL, async () =>
    toIpcAppResult(ok(deps.protocolTakePendingInstallUrl())),
  );

  ipcMain.handle(PLATFORM_IPC.SECURE_STORAGE_GET, async (_e, key: unknown) => {
    if (typeof key !== 'string' || !isValidSecureStorageKey(key)) {
      return toIpcAppResult(err(platformInvalidUrl('Secure storage key is invalid.')));
    }
    return toIpcAppResult(await deps.secureStorage.get(key));
  });

  ipcMain.handle(PLATFORM_IPC.SECURE_STORAGE_SET, async (_e, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || !isValidSecureStorageKey(key)) {
      return toIpcAppResult(err(platformInvalidUrl('Secure storage key is invalid.')));
    }
    if (typeof value !== 'string') {
      return toIpcAppResult(err(platformInvalidUrl('Secure storage value is invalid.')));
    }
    return toIpcAppResult(await deps.secureStorage.set(key, value));
  });

  ipcMain.handle(PLATFORM_IPC.SECURE_STORAGE_DELETE, async (_e, key: unknown) => {
    if (typeof key !== 'string' || !isValidSecureStorageKey(key)) {
      return toIpcAppResult(err(platformInvalidUrl('Secure storage key is invalid.')));
    }
    return toIpcAppResult(await deps.secureStorage.delete(key));
  });

  ipcMain.handle(PLATFORM_IPC.DIAGNOSTICS_GET, async () =>
    toIpcAppResult(ok(deps.buildDiagnosticsSnapshot())),
  );

  ipcMain.handle(PLATFORM_IPC.LOCAL_SERVICE_GET_INFO, async () =>
    toIpcAppResult(ok(deps.getLocalServiceInfo())),
  );
}
