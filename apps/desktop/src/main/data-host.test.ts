import type { IpcMainInvokeEvent, MessagePortMain, WebFrameMain } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  createTrustedFrameCheck,
  DATA_HOST_IPC,
  DATA_HOST_UNAUTHORIZED_FRAME,
  registerDataHostIpc,
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
  registerDataHostIpc({
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
  });
  const call = (sender: FakeFrame | null) =>
    connect!({ senderFrame: sender as unknown as WebFrameMain } as IpcMainInvokeEvent);
  return { call, attached };
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
