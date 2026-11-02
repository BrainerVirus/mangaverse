import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_IPC } from '@app/platform';
import type { IpcMainInvokeEvent, WebFrameMain } from 'electron';
import {
  createRendererImportStore,
  registerRendererImportIpc,
  rendererImportMarkerPath,
  RENDERER_IMPORT_UNAUTHORIZED_FRAME,
} from './renderer-import.js';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const trusted = { url: 'app://app/library' } as WebFrameMain;
const other = { url: 'https://evil.example/' } as WebFrameMain;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

let directory: string;
let databasePath: string;
let handlers: Map<string, Handler>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'renderer-import-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  databasePath = join(directory, 'mangaverse.sqlite');
  handlers = new Map();
  registerRendererImportIpc({
    ipcMain: {
      handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
    } as never,
    store: createRendererImportStore(databasePath),
    isTrustedFrame: (frame): frame is WebFrameMain => frame === trusted,
  });
});

const invoke = (channel: string, frame: WebFrameMain | null, ...args: unknown[]) =>
  handlers.get(channel)!({ senderFrame: frame } as IpcMainInvokeEvent, ...args);

describe('renderer import marker', () => {
  it('starts incomplete and records the verified report atomically', async () => {
    const store = createRendererImportStore(databasePath);
    await expect(store.state()).resolves.toEqual({
      completed: false,
      database: null,
      blobChecksums: {},
    });

    await store.complete({
      database: { tables: { library_entries: 2 }, totalRows: 2, checksum: 'a'.repeat(64) },
      blobs: { pages: 1, covers: 1, totalBytes: 8, checksums: { 'page:m:c:0': 'b'.repeat(64) } },
      pointerRewrites: 1,
    });

    const state = await store.state();
    expect(state.completed).toBe(true);
    expect(state.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.database?.totalRows).toBe(2);
    expect(state.blobChecksums).toEqual({ 'page:m:c:0': 'b'.repeat(64) });
    const marker = JSON.parse(readFileSync(rendererImportMarkerPath(databasePath), 'utf8'));
    expect(marker).toMatchObject({ version: 1, pointerRewrites: 1 });
    expect(readFileSync(rendererImportMarkerPath(databasePath), 'utf8')).not.toContain('.tmp');
  });

  it('reports the database import #210 already verified', async () => {
    writeFileSync(
      `${databasePath}.import.json`,
      JSON.stringify({
        version: 1,
        tables: { chapters: 3 },
        totalRows: 3,
        checksum: 'c'.repeat(64),
      }),
    );
    await expect(createRendererImportStore(databasePath).state()).resolves.toMatchObject({
      completed: false,
      database: { totalRows: 3, checksum: 'c'.repeat(64) },
    });
  });
});

describe('a malformed renderer import marker', () => {
  const valid = {
    version: 1,
    completedAt: '2026-01-01T00:00:00.000Z',
    database: null,
    blobs: { pages: 0, covers: 1, totalBytes: 3, checksums: { 'page:cover:p:m': 'b'.repeat(64) } },
    pointerRewrites: 1,
  };

  it.each([
    ['an empty object', '{}'],
    ['false', 'false'],
    ['null', 'null'],
    ['truncated JSON', JSON.stringify(valid).slice(0, 40)],
    ['an empty file', ''],
    ['an unsupported version', JSON.stringify({ ...valid, version: 2 })],
    ['a missing completedAt', JSON.stringify({ ...valid, completedAt: undefined })],
    ['a completedAt that is not a timestamp', JSON.stringify({ ...valid, completedAt: 'yes' })],
    ['a missing database field', JSON.stringify({ ...valid, database: undefined })],
    ['a missing blobs field', JSON.stringify({ ...valid, blobs: undefined })],
    ['blobs of the wrong shape', JSON.stringify({ ...valid, blobs: { pages: 'many' } })],
    ['an unknown field', JSON.stringify({ ...valid, trusted: true })],
  ])('treats %s as an incomplete import', async (_name, contents) => {
    writeFileSync(rendererImportMarkerPath(databasePath), contents);

    await expect(createRendererImportStore(databasePath).state()).resolves.toEqual({
      completed: false,
      database: null,
      blobChecksums: {},
    });
    await expect(invoke(PLATFORM_IPC.RENDERER_IMPORT_STATE, trusted)).resolves.toMatchObject({
      ok: true,
      value: { completed: false },
    });
  });

  it('accepts the marker it writes', async () => {
    writeFileSync(rendererImportMarkerPath(databasePath), JSON.stringify(valid));

    await expect(createRendererImportStore(databasePath).state()).resolves.toEqual({
      completed: true,
      completedAt: valid.completedAt,
      database: null,
      blobChecksums: valid.blobs.checksums,
    });
  });

  it('ignores a malformed #210 database marker', async () => {
    writeFileSync(`${databasePath}.import.json`, JSON.stringify({ tables: 'x', totalRows: 1 }));

    await expect(createRendererImportStore(databasePath).state()).resolves.toMatchObject({
      database: null,
    });
  });
});

describe('renderer import IPC', () => {
  it('answers only the app frame', async () => {
    for (const frame of [other, null]) {
      await expect(invoke(PLATFORM_IPC.RENDERER_IMPORT_STATE, frame)).resolves.toMatchObject({
        ok: false,
        error: { code: RENDERER_IMPORT_UNAUTHORIZED_FRAME },
      });
      await expect(
        invoke(PLATFORM_IPC.RENDERER_IMPORT_COMPLETE, frame, {
          database: null,
          blobs: { pages: 0, covers: 0, totalBytes: 0, checksums: {} },
          pointerRewrites: 0,
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: RENDERER_IMPORT_UNAUTHORIZED_FRAME } });
    }
  });

  it('records a valid report and rejects a malformed one', async () => {
    const report = {
      database: null,
      blobs: { pages: 0, covers: 0, totalBytes: 0, checksums: {} },
      pointerRewrites: 0,
    };
    await expect(invoke(PLATFORM_IPC.RENDERER_IMPORT_COMPLETE, trusted, report)).resolves.toEqual({
      ok: true,
    });
    await expect(invoke(PLATFORM_IPC.RENDERER_IMPORT_STATE, trusted)).resolves.toMatchObject({
      ok: true,
      value: { completed: true },
    });
    await expect(
      invoke(PLATFORM_IPC.RENDERER_IMPORT_COMPLETE, trusted, { database: null }),
    ).resolves.toMatchObject({ ok: false });
  });
});
