import { createAppError, err, type AppResult } from '@app/shared';
import { DATA_HOST_HANDLE, type DataHostHandle } from './data-host-handle.js';
import {
  DATA_HOST_ERROR,
  DataHostError,
  type CacheBlobKeyRewrite,
  type DataHostChangeEvent,
  type DataHostMessage,
  type DataHostOpenResult,
  type DataHostRequest,
  type DataHostStatus,
} from './data-host-protocol.js';

/** A window's end of the port main handed it. */
export interface DataHostClientPort {
  postMessage(request: DataHostRequest): void;
  onMessage(listener: (data: unknown) => void): void;
}

export interface DataHostClientOptions {
  /** How long a call waits for its reply; a host that died never answers. */
  readonly callTimeoutMs?: number;
  /** Opening may import a whole snapshot, so it waits longer. */
  readonly openTimeoutMs?: number;
}

export interface DataHostClient {
  /** Pass this as `db`: every repository call made with it runs in the host. */
  readonly handle: DataHostHandle;
  status(): Promise<AppResult<DataHostStatus>>;
  /**
   * Opens the native database, importing `snapshot` only if none exists yet. `rewrites` move
   * cache blob pointers as part of that one import, so the verified copy already points at
   * the page-store files.
   */
  open(
    snapshot: Uint8Array | null,
    rewrites?: readonly CacheBlobKeyRewrite[],
  ): Promise<AppResult<DataHostOpenResult>>;
  /** Hears every committed change batch, and `resync` after a reconnect. */
  onChange(listener: (event: DataHostChangeEvent) => void): () => void;
  /**
   * Moves to a restarted host's port. The new host is opened before any later call reaches it;
   * calls still waiting on the old port are not resent and end at once with `crashed`, since
   * whether they committed is unknown. Listeners get `resync` once the host is open again.
   */
  reconnect(port: DataHostClientPort): Promise<AppResult<DataHostOpenResult>>;
}

type Pending = (result: AppResult<unknown>) => void;

const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_OPEN_TIMEOUT_MS = 300_000;

export function createDataHostClient(
  initialPort: DataHostClientPort,
  options: DataHostClientOptions = {},
): DataHostClient {
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const openTimeoutMs = options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
  let nextId = 1;
  let port = initialPort;
  const pending = new Map<number, Pending>();
  const listeners = new Set<(event: DataHostChangeEvent) => void>();

  const emit = (event: DataHostChangeEvent) => {
    for (const listener of listeners) listener(event);
  };

  const listen = (target: DataHostClientPort) =>
    target.onMessage((data) => {
      const message = data as DataHostMessage | null;
      if (message === null || typeof message !== 'object') return;
      if ('kind' in message) {
        // A late batch from a replaced host still describes committed rows.
        if (message.kind === 'changes') emit({ kind: 'changes', changes: message.changes });
        return;
      }
      if (typeof message.id !== 'number') return;
      const settle = pending.get(message.id);
      pending.delete(message.id);
      settle?.(message.result);
    });
  listen(port);

  const send = <T>(
    request: (id: number) => DataHostRequest,
    timeoutMs = callTimeoutMs,
  ): Promise<AppResult<T>> =>
    new Promise((resolve) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        if (!pending.delete(id)) return;
        resolve(
          err(
            createAppError({
              code: DATA_HOST_ERROR.timeout,
              message: 'The local database did not answer in time.',
              details: { timeoutMs },
            }),
          ),
        );
      }, timeoutMs);
      pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result as AppResult<T>);
      });
      port.postMessage(request(id));
    });

  const open = (snapshot: Uint8Array | null, rewrites: readonly CacheBlobKeyRewrite[] = []) =>
    send<DataHostOpenResult>(
      (id) => ({ kind: 'open', id, snapshot, ...(rewrites.length > 0 ? { rewrites } : {}) }),
      openTimeoutMs,
    );

  const handle: DataHostHandle = {
    [DATA_HOST_HANDLE]: true,
    call: (method, args) =>
      send<unknown>((id) => ({ kind: 'call', id, method, args: [...args] })).then((result) => {
        if (!result.ok) throw new DataHostError(result.error);
        return result.value;
      }),
  };

  return {
    handle,
    status: () => send<DataHostStatus>((id) => ({ kind: 'status', id })),
    open,
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reconnect(next) {
      // The old host will never answer these; each settle clears its own timer.
      for (const [id, settle] of [...pending]) {
        pending.delete(id);
        settle(
          err(
            createAppError({
              code: DATA_HOST_ERROR.crashed,
              message:
                'The local database restarted while this was in progress. It may or may not have been saved.',
            }),
          ),
        );
      }
      port = next;
      listen(next);
      // Sent before anything else on the new port: the host answers in arrival order.
      return open(null).then((result) => {
        if (result.ok) emit({ kind: 'resync' });
        return result;
      });
    },
  };
}
