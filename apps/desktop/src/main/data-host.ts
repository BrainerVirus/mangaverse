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

interface HostProcessPort {
  postMessage(message: DataHostProcessMessage, transfer: MessagePortMain[]): void;
}

export interface DataHostIpcDeps {
  readonly ipcMain: Pick<IpcMain, 'handle'>;
  readonly createChannel: () => { port1: MessagePortMain; port2: MessagePortMain };
  /** The host process running now: a restart replaces it. */
  readonly hostProcess: HostProcessPort;
  readonly isTrustedFrame: (frame: WebFrameMain | null) => frame is WebFrameMain;
  /** The main frames of every window main created, to hand each a port after a restart. */
  readonly ownedMainFrames?: () => readonly WebFrameMain[];
}

export interface DataHostIpc {
  /**
   * Hands every window that had connected a port to the restarted host. A window that never
   * connected asks on its own when it does.
   */
  reconnectWindows(): number;
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
      .some(
        (owned) => owned.processId === frame.processId && owned.routingId === frame.routingId,
      ) &&
    options.allowedOrigins.some((origin) => frame.url.startsWith(`${origin}/`));
}

const frameKey = (frame: FrameIdentity) => `${frame.processId}:${frame.routingId}`;

export function registerDataHostIpc(deps: DataHostIpcDeps): DataHostIpc {
  const connected = new Set<string>();
  const handOver = (frame: WebFrameMain) => {
    const { port1, port2 } = deps.createChannel();
    deps.hostProcess.postMessage({ type: 'attach' }, [port1]);
    frame.postMessage(DATA_HOST_IPC.PORT, null, [port2]);
  };

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
    connected.add(frameKey(frame));
    handOver(frame);
    return ok(undefined);
  });

  return {
    reconnectWindows() {
      const frames = (deps.ownedMainFrames?.() ?? []).filter(
        (frame) => connected.has(frameKey(frame)) && deps.isTrustedFrame(frame),
      );
      for (const frame of frames) handOver(frame);
      return frames.length;
    },
  };
}

/** Waits before restart attempt n (0-based); the last value repeats. */
export const DATA_HOST_RESTART_BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000, 8_000] as const;
/** Consecutive crashes after which main stops restarting the host. */
export const DATA_HOST_MAX_RESTARTS = 8;
/** A host that ran this long before exiting starts the backoff over. */
const DATA_HOST_STABLE_MS = 30_000;

interface SupervisedProcess extends HostProcessPort {
  readonly pid: number | undefined;
  onExit(listener: (code: number) => void): void;
}

export interface DataHostSupervisorDeps {
  readonly fork: () => SupervisedProcess;
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly now: () => number;
  /** A replacement host is running: hand the windows their new ports. */
  readonly onRestarted: () => void;
  readonly onGaveUp: (exitCode: number) => void;
}

export interface DataHostSupervisor extends HostProcessPort {
  readonly pid: number | undefined;
  /** Quitting: an exit from now on is expected, not a crash. */
  stop(): void;
}

/**
 * Keeps one data host running. An unexpected exit is restarted after a bounded backoff; the
 * new process opens the same file, which WAL keeps consistent after a kill. A host that
 * keeps dying is given up on rather than restarted in a loop.
 */
export function superviseDataHost(deps: DataHostSupervisorDeps): DataHostSupervisor {
  let stopped = false;
  let crashes = 0;
  let current: SupervisedProcess;

  const start = () => {
    const startedAt = deps.now();
    const child = deps.fork();
    current = child;
    child.onExit((code) => {
      if (stopped || current !== child) return;
      if (deps.now() - startedAt >= DATA_HOST_STABLE_MS) crashes = 0;
      if (crashes >= DATA_HOST_MAX_RESTARTS) {
        deps.onGaveUp(code);
        return;
      }
      const delay =
        DATA_HOST_RESTART_BACKOFF_MS[Math.min(crashes, DATA_HOST_RESTART_BACKOFF_MS.length - 1)]!;
      crashes += 1;
      deps.schedule(() => {
        if (stopped) return;
        start();
        deps.onRestarted();
      }, delay);
    });
  };
  start();

  return {
    get pid() {
      return current.pid;
    },
    postMessage: (message, transfer) => current.postMessage(message, transfer),
    stop() {
      stopped = true;
    },
  };
}
