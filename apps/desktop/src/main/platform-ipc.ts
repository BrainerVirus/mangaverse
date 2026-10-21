import { err, ok, type AppError, type AppResult } from '@app/shared';
import type {
  BrowserWindow,
  Clipboard,
  Dialog,
  IpcMain,
  Net,
  OpenDialogOptions,
  SaveDialogOptions,
  Shell,
} from 'electron';
import {
  PLATFORM_IPC,
  isBlockedIpAddress,
  isSafeNetworkFetchUrl,
  platformInvalidUrl,
  platformIoFailed,
  platformPermissionDenied,
  platformUnexpected,
  platformIpcRequestSchema,
  type LocalServiceInfo,
  type PlatformCapabilities,
  type PlatformDiagnosticsSnapshot,
  type PlatformIpcChannel,
  type PlatformIpcRequest,
} from '@app/platform';
import {
  fetchMainProcessBytes,
  REQUEST_TIMEOUT_MS,
  settleByDeadline,
} from './main-process-fetch.js';

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

interface SecureStorageHandlers {
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
  readonly net: Net;
  readonly readFileUtf8: (path: string) => Promise<string>;
  readonly writeFileUtf8: (path: string, content: string) => Promise<void>;
  readonly getCapabilities: () => PlatformCapabilities;
  readonly protocolTakePendingInstallUrl: () => string | null;
  readonly secureStorage: SecureStorageHandlers;
  readonly getLocalServiceInfo: () => LocalServiceInfo;
  readonly buildDiagnosticsSnapshot: () => PlatformDiagnosticsSnapshot;
  readonly resolveHostAddresses: (hostname: string) => Promise<readonly string[]>;
}

type RequestArgs<C extends PlatformIpcChannel> = {
  [K in PlatformIpcChannel]: Extract<PlatformIpcRequest, { channel: K }>['args'];
}[C];

export function registerPlatformIpc(deps: PlatformIpcDeps): void {
  const { ipcMain } = deps;

  /** Parse `{ channel, args }` against the shared union; raw exceptions never cross IPC. */
  function handle<C extends PlatformIpcChannel>(
    channel: C,
    handler: (args: RequestArgs<C>) => Promise<AppResult<unknown>>,
  ): void {
    ipcMain.handle(channel, async (_event, ...rawArgs: unknown[]) => {
      const parsed = platformIpcRequestSchema.safeParse({ channel, args: rawArgs });
      if (!parsed.success) {
        return toIpcAppResult(err(platformInvalidUrl('IPC request payload is invalid.')));
      }
      try {
        // The parsed channel literal selects this handler's member of the union.
        const args = parsed.data.args as RequestArgs<C>;
        return toIpcAppResult(await handler(args));
      } catch (e) {
        return toIpcAppResult(err(platformUnexpected('IPC handler failed.', e)));
      }
    });
  }

  async function networkFetchAllowed(url: string): Promise<boolean> {
    if (!isSafeNetworkFetchUrl(url)) {
      return false;
    }
    try {
      // shortcut: the resolved address is checked, not pinned, so a fast DNS
      // rebind can still race the fetch; pin it when Electron exposes a hook.
      const addresses = await deps.resolveHostAddresses(
        new URL(url).hostname.replace(/^\[|\]$/g, ''),
      );
      return addresses.length > 0 && addresses.every((address) => !isBlockedIpAddress(address));
    } catch {
      return false;
    }
  }

  handle(PLATFORM_IPC.CAPABILITIES_GET, async () => ok(deps.getCapabilities()));

  handle(PLATFORM_IPC.CLIPBOARD_READ_TEXT, async () => {
    try {
      return ok(deps.clipboard.readText());
    } catch {
      return err(platformPermissionDenied('Could not read clipboard.'));
    }
  });

  handle(PLATFORM_IPC.CLIPBOARD_WRITE_TEXT, async ([text]) => {
    try {
      await deps.clipboard.writeText(text);
      return ok(undefined);
    } catch {
      return err(platformPermissionDenied('Could not write clipboard.'));
    }
  });

  handle(PLATFORM_IPC.FILE_OPEN_TEXT, async ([options]) => {
    const win = deps.getTargetWindow();
    const dialogOptions: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'Text', extensions: ['txt', 'md', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      ...(options?.suggestedName ? { defaultPath: options.suggestedName } : {}),
    };
    const picked = win
      ? await deps.dialog.showOpenDialog(win, dialogOptions)
      : await deps.dialog.showOpenDialog(dialogOptions);
    if (picked.canceled || picked.filePaths[0] === undefined) {
      return ok({ content: '', cancelled: true });
    }
    const path = picked.filePaths[0];
    try {
      const content = await deps.readFileUtf8(path);
      return ok({ path, content });
    } catch (e) {
      return err(platformIoFailed('Could not read file.', e));
    }
  });

  handle(PLATFORM_IPC.FILE_SAVE_TEXT, async ([options]) => {
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
      return ok({ content: options.content, cancelled: true });
    }
    try {
      await deps.writeFileUtf8(picked.filePath, options.content);
      return ok({ path: picked.filePath, content: options.content });
    } catch (e) {
      return err(platformIoFailed('Could not write file.', e));
    }
  });

  handle(PLATFORM_IPC.FULLSCREEN_ENTER, async () => {
    const win = deps.getTargetWindow();
    if (!win) {
      return err(platformPermissionDenied('No active window for fullscreen.'));
    }
    try {
      win.setFullScreen(true);
      return ok(undefined);
    } catch (e) {
      return err(platformIoFailed('Could not enter fullscreen.', e));
    }
  });

  handle(PLATFORM_IPC.FULLSCREEN_EXIT, async () => {
    const win = deps.getTargetWindow();
    if (!win) {
      return err(platformPermissionDenied('No active window for fullscreen.'));
    }
    try {
      win.setFullScreen(false);
      return ok(undefined);
    } catch (e) {
      return err(platformIoFailed('Could not exit fullscreen.', e));
    }
  });

  handle(PLATFORM_IPC.FULLSCREEN_IS_ACTIVE, async () => {
    const win = deps.getTargetWindow();
    if (!win) {
      return ok(false);
    }
    return ok(win.isFullScreen());
  });

  handle(PLATFORM_IPC.EXTERNAL_LINK_OPEN, async ([url]) => {
    try {
      await deps.shell.openExternal(url);
      return ok(undefined);
    } catch (e) {
      return err(platformIoFailed('Could not open external link.', e));
    }
  });

  handle(PLATFORM_IPC.PROTOCOL_GET_PENDING_INSTALL_URL, async () =>
    ok(deps.protocolTakePendingInstallUrl()),
  );

  handle(PLATFORM_IPC.SECURE_STORAGE_GET, async ([key]) => deps.secureStorage.get(key));

  handle(PLATFORM_IPC.SECURE_STORAGE_SET, async ([key, value]) =>
    deps.secureStorage.set(key, value),
  );

  handle(PLATFORM_IPC.SECURE_STORAGE_DELETE, async ([key]) => deps.secureStorage.delete(key));

  handle(PLATFORM_IPC.DIAGNOSTICS_GET, async () => ok(deps.buildDiagnosticsSnapshot()));

  handle(PLATFORM_IPC.LOCAL_SERVICE_GET_INFO, async () => ok(deps.getLocalServiceInfo()));

  handle(PLATFORM_IPC.NETWORK_FETCH_BYTES, async ([url]) => {
    // The deadline starts before DNS so a hung lookup cannot outlive the request.
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    const allowed = await settleByDeadline(networkFetchAllowed(url), deadline);
    if (allowed === undefined) {
      return err(platformIoFailed('Network fetch timed out.'));
    }
    if (!allowed) {
      return err(platformInvalidUrl('Network fetch target is not allowed.'));
    }
    try {
      const result = await fetchMainProcessBytes(
        (options) => deps.net.request(options),
        url,
        networkFetchAllowed,
        deadline,
      );
      if (result === undefined && Date.now() >= deadline) {
        return err(platformIoFailed('Network fetch timed out.'));
      }
      return ok(result);
    } catch (e) {
      return err(platformIoFailed('Network fetch failed.', e));
    }
  });
}
