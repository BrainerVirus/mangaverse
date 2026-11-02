import type { AppResult } from '@app/shared';
import { DATA_HOST_HANDLE, type DataHostHandle } from './data-host-handle.js';
import {
  DataHostError,
  type DataHostOpenResult,
  type DataHostReply,
  type DataHostRequest,
  type DataHostStatus,
} from './data-host-protocol.js';

/** A window's end of the port main handed it. */
export interface DataHostClientPort {
  postMessage(request: DataHostRequest): void;
  onMessage(listener: (data: unknown) => void): void;
}

export interface DataHostClient {
  /** Pass this as `db`: every repository call made with it runs in the host. */
  readonly handle: DataHostHandle;
  status(): Promise<AppResult<DataHostStatus>>;
  /** Opens the native database, importing `snapshot` only if none exists yet. */
  open(snapshot: Uint8Array | null): Promise<AppResult<DataHostOpenResult>>;
}

type Pending = (result: AppResult<unknown>) => void;

export function createDataHostClient(port: DataHostClientPort): DataHostClient {
  let nextId = 1;
  const pending = new Map<number, Pending>();

  port.onMessage((data) => {
    const reply = data as DataHostReply | null;
    if (reply === null || typeof reply.id !== 'number') return;
    const settle = pending.get(reply.id);
    pending.delete(reply.id);
    settle?.(reply.result);
  });

  const send = <T>(request: (id: number) => DataHostRequest): Promise<AppResult<T>> =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve as Pending);
      port.postMessage(request(id));
    });

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
    open: (snapshot) => send<DataHostOpenResult>((id) => ({ kind: 'open', id, snapshot })),
  };
}
