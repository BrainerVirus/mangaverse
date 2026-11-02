import type { IpcMainInvokeEvent, MessagePortMain, WebFrameMain } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  createTrustedFrameCheck,
  DATA_HOST_IPC,
  DATA_HOST_MAX_RESTARTS,
  DATA_HOST_RESTART_BACKOFF_MS,
  DATA_HOST_UNAUTHORIZED_FRAME,
  registerDataHostIpc,
  superviseDataHost,
  type DataHostProcessMessage,
} from './data-host.js';

interface FakeFrame {
  readonly processId: number;
  readonly routingId: number;
  readonly url: string;
  readonly parent: FakeFrame | null;
  readonly sent: { channel: string; ports: unknown[] }[];
  postMessage(channel: string, message: unknown, ports: unknown[]): void;
}

function frame(processId: number, routingId: number, url: string, parent: FakeFrame | null = null) {
  const sent: FakeFrame['sent'] = [];
  const fake: FakeFrame = {
    processId,
    routingId,
    url,
    parent,
    sent,
    postMessage: (channel, _message, ports) => sent.push({ channel, ports }),
  };
  return fake;
}

function harness(owned: FakeFrame[]) {
  let connect: ((event: IpcMainInvokeEvent) => unknown) | undefined;
  const attached: { message: DataHostProcessMessage; ports: MessagePortMain[] }[] = [];
  const ipc = registerDataHostIpc({
    ipcMain: {
      handle: (channel, listener) => {
        expect(channel).toBe(DATA_HOST_IPC.CONNECT);
        connect = listener as typeof connect;
      },
    },
    createChannel: () => ({
      port1: { side: 'host' } as unknown as MessagePortMain,
      port2: { side: 'window' } as unknown as MessagePortMain,
    }),
    hostProcess: { postMessage: (message, ports) => attached.push({ message, ports }) },
    isTrustedFrame: createTrustedFrameCheck({
      ownedMainFrames: () => owned,
      allowedOrigins: ['app://app'],
    }),
    ownedMainFrames: () => owned as unknown as WebFrameMain[],
  });
  const call = (sender: FakeFrame | null) =>
    connect!({ senderFrame: sender as unknown as WebFrameMain } as IpcMainInvokeEvent);
  return { call, attached, ipc };
}

describe('data host connect', () => {
  it('hands the main frame of an owned window one port, and the host the other', () => {
    const main = frame(4, 1, 'app://app/library');
    const { call, attached } = harness([main]);
    // A navigation can hand main a new frame object for the same frame.
    const sameFrameNewObject = frame(4, 1, 'app://app/library');
    expect(call(sameFrameNewObject)).toEqual({ ok: true, value: undefined });
    expect(attached).toEqual([{ message: { type: 'attach' }, ports: [{ side: 'host' }] }]);
    expect(sameFrameNewObject.sent).toEqual([
      { channel: DATA_HOST_IPC.PORT, ports: [{ side: 'window' }] },
    ]);
  });

  it.each([
    ['no frame', null],
    ['a frame of a window main did not create', frame(9, 1, 'app://app/library')],
    ['a subframe of an owned window', frame(4, 1, 'app://app/embed', frame(4, 0, 'app://app/'))],
    ['an owned frame showing another origin', frame(4, 1, 'https://example.com/')],
    ['an origin that only starts like the app', frame(4, 1, 'app://app.evil/')],
  ])('refuses %s with a typed error and opens nothing', (_label, sender) => {
    const { call, attached } = harness([frame(4, 1, 'app://app/')]);
    expect(call(sender)).toMatchObject({
      ok: false,
      error: { code: DATA_HOST_UNAUTHORIZED_FRAME },
    });
    expect(attached).toEqual([]);
    expect(sender?.sent ?? []).toEqual([]);
  });
});

describe('data host restart', () => {
  it('hands a new port only to the owned windows that had connected', () => {
    const connectedWindow = frame(4, 1, 'app://app/library');
    const neverConnected = frame(5, 1, 'app://app/');
    const { call, attached, ipc } = harness([connectedWindow, neverConnected]);
    call(connectedWindow);
    expect(ipc.reconnectWindows()).toBe(1);
    expect(attached).toHaveLength(2);
    expect(connectedWindow.sent.map((sent) => sent.channel)).toEqual([
      DATA_HOST_IPC.PORT,
      DATA_HOST_IPC.PORT,
    ]);
    expect(neverConnected.sent).toEqual([]);
  });

  function supervised() {
    const exits: ((code: number) => void)[] = [];
    const scheduled: { run: () => void; delayMs: number }[] = [];
    const events: string[] = [];
    let clock = 0;
    const supervisor = superviseDataHost({
      fork: () => {
        const pid = exits.length + 100;
        events.push(`fork ${pid}`);
        return {
          pid,
          postMessage: () => events.push(`post ${pid}`),
          onExit: (listener) => exits.push(listener),
        };
      },
      schedule: (run, delayMs) => scheduled.push({ run, delayMs }),
      now: () => clock,
      onRestarted: () => events.push('restarted'),
      onGaveUp: (code) => events.push(`gave up ${code}`),
    });
    const crash = (afterMs = 10) => {
      clock += afterMs;
      exits.at(-1)!(9);
      const next = scheduled.shift();
      next?.run();
      return next?.delayMs;
    };
    return { supervisor, events, crash, scheduled };
  }

  it('restarts a crashed host with a bounded backoff and routes ports to the new one', () => {
    const { supervisor, events, crash } = supervised();
    expect(supervisor.pid).toBe(100);
    expect(crash()).toBe(DATA_HOST_RESTART_BACKOFF_MS[0]);
    expect(supervisor.pid).toBe(101);
    supervisor.postMessage({ type: 'attach' }, []);
    expect(events).toEqual(['fork 100', 'fork 101', 'restarted', 'post 101']);
    expect(crash()).toBe(DATA_HOST_RESTART_BACKOFF_MS[1]);
    // A host that ran long enough starts the backoff over.
    expect(crash(60_000)).toBe(DATA_HOST_RESTART_BACKOFF_MS[0]);
  });

  it('gives up after repeated crashes instead of restarting in a loop', () => {
    const { events, crash } = supervised();
    const delays = Array.from({ length: DATA_HOST_MAX_RESTARTS }, () => crash());
    expect(Math.max(...(delays as number[]))).toBe(DATA_HOST_RESTART_BACKOFF_MS.at(-1));
    expect(crash()).toBeUndefined();
    expect(events.at(-1)).toBe('gave up 9');
  });

  it('does not restart a host that exits while the app quits', () => {
    const { supervisor, events, crash } = supervised();
    supervisor.stop();
    expect(crash()).toBeUndefined();
    expect(events).toEqual(['fork 100']);
  });
});
