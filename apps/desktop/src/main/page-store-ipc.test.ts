import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IPC } from '@app/platform';
import type { IpcMainInvokeEvent, WebFrameMain } from 'electron';
import { createPageStore } from './page-store.js';
import {
  PAGE_STORE_CHANNELS,
  PAGE_STORE_UNAUTHORIZED_FRAME,
  registerPageStoreIpc,
} from './page-store-ipc.js';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const trusted = { url: 'app://app/reader' } as WebFrameMain;
const other = { url: 'https://evil.example/' } as WebFrameMain;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const KEY = 'page:p:m:c:0';

let base: string;
let handlers: Map<string, Handler>;

beforeEach(async () => {
  base = realpathSync(await mkdtemp(join(tmpdir(), 'page-store-ipc-')));
  handlers = new Map();
  registerPageStoreIpc({
    ipcMain: { handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) },
    store: createPageStore(join(base, 'pages')),
    isTrustedFrame: (frame): frame is WebFrameMain => frame === trusted,
  });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const invoke = (channel: string, frame: WebFrameMain | null, ...args: unknown[]) =>
  handlers.get(channel)!({ senderFrame: frame } as IpcMainInvokeEvent, ...args);

describe('page store IPC', () => {
  it('registers exactly the page store channels', () => {
    expect([...handlers.keys()].sort()).toEqual([...PAGE_STORE_CHANNELS].sort());
  });

  it('writes, resolves, lists and deletes for the app frame', async () => {
    const put = await invoke(PLATFORM_IPC.PAGE_STORE_PUT, trusted, KEY, JPEG.buffer, 'image/jpeg');
    expect(put).toMatchObject({
      ok: true,
      value: expect.stringMatching(/^page:\/\/store\/[0-9a-f]{64}$/),
    });
    expect(await invoke(PLATFORM_IPC.PAGE_STORE_URL, trusted, KEY)).toEqual(put);
    expect(await invoke(PLATFORM_IPC.PAGE_STORE_LIST_KEYS, trusted)).toEqual({
      ok: true,
      value: [KEY],
    });
    expect(await invoke(PLATFORM_IPC.PAGE_STORE_DELETE, trusted, KEY)).toEqual({ ok: true });
    expect(await readdir(join(base, 'pages'))).toEqual([]);
  });

  it('refuses every channel from another frame or no frame', async () => {
    for (const frame of [other, null]) {
      for (const [channel, args] of [
        [PLATFORM_IPC.PAGE_STORE_PUT, [KEY, JPEG.buffer, 'image/jpeg']],
        [PLATFORM_IPC.PAGE_STORE_URL, [KEY]],
        [PLATFORM_IPC.PAGE_STORE_DELETE, [KEY]],
        [PLATFORM_IPC.PAGE_STORE_LIST_KEYS, []],
      ] as const) {
        expect(await invoke(channel, frame, ...args)).toMatchObject({
          ok: false,
          error: { code: PAGE_STORE_UNAUTHORIZED_FRAME },
        });
      }
    }
    expect(await readdir(base)).toEqual([]);
  });

  it('rejects malformed payloads, non-page keys and path-shaped keys', async () => {
    for (const args of [
      ['cover:p:m', JPEG.buffer, 'image/jpeg'],
      ['../../etc/passwd', JPEG.buffer, 'image/jpeg'],
      [KEY, 'not bytes', 'image/jpeg'],
      [KEY, new ArrayBuffer(0), 'image/jpeg'],
      [`page:${'\0'}`, JPEG.buffer, 'image/jpeg'],
    ]) {
      expect(await invoke(PLATFORM_IPC.PAGE_STORE_PUT, trusted, ...args)).toMatchObject({
        ok: false,
      });
    }
  });

  it('reports a non-image body as a failure, not a throw', async () => {
    const body = new TextEncoder().encode('<html>').buffer;
    expect(
      await invoke(PLATFORM_IPC.PAGE_STORE_PUT, trusted, KEY, body, 'text/html'),
    ).toMatchObject({
      ok: false,
      error: { code: 'platform.io-failed' },
    });
  });
});
