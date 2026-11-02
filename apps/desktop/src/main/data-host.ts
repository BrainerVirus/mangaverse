import { createAppError, err, ok, type AppResult } from '@app/shared';
import type { IpcMain, MessagePortMain, WebFrameMain } from 'electron';

// Main's side of the data host (ADR 0001, decision 5; spec 04 X6). The host runs in a utility
// process and talks only to ports main hands it, and main hands one only to the main frame of
// a window it created, showing the app's own origin. Nothing listens on a socket.

export const DATA_HOST_IPC = {
  CONNECT: 'data-host:connect',
  PORT: 'data-host:port',
} as const;

export const DATA_HOST_UNAUTHORIZED_FRAME = 'data-host.unauthorized_frame';

/** Messages main sends the utility process; it validates them on arrival. */
export type DataHostProcessMessage = { readonly type: 'attach' };

export interface DataHostIpcDeps {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly createChannel: () => { port1: MessagePortMain; port2: MessagePortMain };
  readonly hostProcess: {
    postMessage(message: DataHostProcessMessage, transfer: MessagePortMain[]): void;
  };
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
}

type FrameIdentity = Pick<WebFrameMain, 'processId' | 'routingId'>;

/**
 * A frame may connect when it is the current main frame of a window main created, showing an
 * allowed origin. Frames compare by process and routing id: a navigation can swap the object.
 */
export function createTrustedFrameCheck(options: {
  readonly ownedMainFrames: () => readonly FrameIdentity[];
  readonly allowedOrigins: readonly string[];
}): (frame: WebFrameMain | null) => frame is WebFrameMain {
  return (frame): frame is WebFrameMain =>
    frame !== null &&
    frame.parent === null &&
    options
      .ownedMainFrames()
      .some((owned) => owned.processId === frame.processId && owned.routingId === frame.routingId) &&
    options.allowedOrigins.some((origin) => frame.url.startsWith(`${origin}/`));
}

export function registerDataHostIpc(deps: DataHostIpcDeps): void {
  deps.ipcMain.handle(DATA_HOST_IPC.CONNECT, (event): AppResult<void> => {
    const frame = event.senderFrame;
    if (!deps.isTrustedFrame(frame)) {
      return err(
        createAppError({
          code: DATA_HOST_UNAUTHORIZED_FRAME,
          message: 'This frame may not reach the local database.',
        }),
      );
    }
    const { port1, port2 } = deps.createChannel();
    deps.hostProcess.postMessage({ type: 'attach' }, [port1]);
    frame.postMessage(DATA_HOST_IPC.PORT, null, [port2]);
    return ok(undefined);
  });
}
