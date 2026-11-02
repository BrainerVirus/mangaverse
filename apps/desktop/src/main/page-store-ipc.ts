import { createAppError, err, ok, type AppResult } from '@app/shared';
import type { IpcMain, IpcMainInvokeEvent, WebFrameMain } from 'electron';
import {
  PLATFORM_IPC,
  platformInvalidUrl,
  platformIoFailed,
  platformIpcRequestSchema,
  type PlatformIpcRequest,
} from '@app/platform';
import type { PageStore } from './page-store.js';
import { toIpcAppResult } from './platform-ipc.js';

export const PAGE_STORE_UNAUTHORIZED_FRAME = 'page-store.unauthorized_frame';

/** Registered here, with sender authorization, rather than by `registerPlatformIpc`. */
export const PAGE_STORE_CHANNELS = [
  PLATFORM_IPC.PAGE_STORE_PUT,
  PLATFORM_IPC.PAGE_STORE_URL,
  PLATFORM_IPC.PAGE_STORE_DELETE,
  PLATFORM_IPC.PAGE_STORE_LIST_KEYS,
] as const;

type PageStoreChannel = (typeof PAGE_STORE_CHANNELS)[number];

type ArgsOf<C extends PageStoreChannel> = Extract<PlatformIpcRequest, { channel: C }>['args'];

export interface PageStoreIpcDeps {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly store: PageStore;
  /** The data host's check: the main frame of a window main created, on the app's origin. */
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
}

/**
 * The renderer's only way into the page store. Each call is validated against the shared
 * schema and authorized by its sender frame, so a frame that is not the app's own cannot
 * write, probe or delete pages.
 */
export function registerPageStoreIpc(deps: PageStoreIpcDeps): void {
  function handle<C extends PageStoreChannel>(
    channel: C,
    handler: (args: ArgsOf<C>) => Promise<AppResult<unknown>>,
  ): void {
    deps.ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...rawArgs: unknown[]) => {
      if (!deps.isTrustedFrame(event.senderFrame)) {
        return toIpcAppResult(
          err(
            createAppError({
              code: PAGE_STORE_UNAUTHORIZED_FRAME,
              message: 'This frame may not reach the page store.',
            }),
          ),
        );
      }
      const parsed = platformIpcRequestSchema.safeParse({ channel, args: rawArgs });
      if (!parsed.success) {
        return toIpcAppResult(err(platformInvalidUrl('IPC request payload is invalid.')));
      }
      // A store failure (a non-image body, a full disk) is a typed result, never a throw.
      const args = parsed.data.args as ArgsOf<C>;
      return Promise.resolve()
        .then(() => handler(args))
        .then(toIpcAppResult, (e: unknown) =>
          toIpcAppResult(err(platformIoFailed('Page store call failed.', e))),
        );
    });
  }

  handle(PLATFORM_IPC.PAGE_STORE_PUT, async ([key, data, mimeType]) => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return ok(await deps.store.put(key, bytes, mimeType));
  });
  handle(PLATFORM_IPC.PAGE_STORE_URL, async ([key]) => ok(await deps.store.urlFor(key)));
  handle(PLATFORM_IPC.PAGE_STORE_DELETE, async ([key]) => ok(await deps.store.delete(key)));
  handle(PLATFORM_IPC.PAGE_STORE_LIST_KEYS, async () => ok(await deps.store.listKeys()));
}
