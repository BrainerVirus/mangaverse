import { describe, expect, it, vi } from 'vitest';
import { ok, err, createAppError } from '@app/shared';
import type { RendererImportReport } from '@app/platform';
import {
  buildOldDataExport,
  getRendererImportState,
  moveRendererBlobs,
  pageStoreKeyForKey,
  resetRendererImportState,
  runRendererDataImport,
  type BlobMoveDeps,
  type RendererImportDeps,
} from '../renderer-data-import.js';

const PAGE_KEY = 'page:mangadex:m1:c1:0';
const COVER_KEY = 'cover:mangadex:m1';
const CUSTOM_COVER_KEY = 'cover:mangadex:m2';

const bytes = (seed: number) => new Uint8Array([seed, seed + 1, seed + 2, seed + 3]);
const hash = async (value: Uint8Array) =>
  [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');

interface FakeIdb {
  readonly records: Map<string, { data: ArrayBuffer; mimeType: string }>;
  readonly written: Map<string, Uint8Array>;
  readonly putCalls: string[];
  readonly deps: BlobMoveDeps;
  failPutFor: string | null;
  tamperFor: string | null;
}

function fakeIdb(): FakeIdb {
  const state: FakeIdb = {
    records: new Map(),
    written: new Map(),
    putCalls: [],
    failPutFor: null,
    tamperFor: null,
    deps: undefined as unknown as BlobMoveDeps,
  };
  state.deps = {
    listKeys: async () => [...state.records.keys()],
    readBlob: async (key) => state.records.get(key),
    putBlob: async (key, data) => {
      state.putCalls.push(key);
      if (state.failPutFor === key) {
        return err(createAppError({ code: 'platform.io-failed', message: 'disk is full' }));
      }
      state.written.set(key, new Uint8Array(data));
      return ok(key);
    },
    verifyBlob: async (key) => {
      const stored = state.written.get(key);
      if (stored === undefined) return ok(undefined);
      const value = new Uint8Array(stored);
      if (state.tamperFor === key) value[0] = (value[0]! + 1) % 256;
      return ok({ byteSize: value.byteLength, sha256: await hash(value) });
    },
    sha256: hash,
  };
  return state;
}

function seededIdb(): FakeIdb {
  const idb = fakeIdb();
  const page = bytes(1);
  idb.records.set(PAGE_KEY, { data: page.buffer as ArrayBuffer, mimeType: 'image/jpeg' });
  idb.records.set(COVER_KEY, { data: bytes(9).buffer as ArrayBuffer, mimeType: 'image/jpeg' });
  idb.records.set(CUSTOM_COVER_KEY, {
    data: bytes(5).buffer as ArrayBuffer,
    mimeType: 'image/png',
  });
  idb.records.set('unrelated:key', {
    data: bytes(3).buffer as ArrayBuffer,
    mimeType: 'text/plain',
  });
  return idb;
}

interface Harness {
  readonly reports: RendererImportReport[];
  readonly opens: {
    snapshot: Uint8Array | null;
    rewrites: readonly { id: string; blobKey: string }[];
  }[];
  readonly rewritten: { id: string; blobKey: string }[][];
  readonly deps: RendererImportDeps;
  completed: boolean;
  openImported: boolean;
}

function harness(idb: FakeIdb): Harness {
  const state: Harness = {
    reports: [],
    opens: [],
    rewritten: [],
    completed: false,
    openImported: true,
    deps: undefined as unknown as RendererImportDeps,
  };
  state.deps = {
    markerState: async () =>
      ok({
        completed: state.completed,
        database: state.completed ? { tables: {}, totalRows: 0, checksum: 'x' } : null,
      }),
    recordComplete: async (report) => {
      state.reports.push(report);
      return ok(undefined);
    },
    blobs: idb.deps,
    snapshot: null,
    openHost: async (snapshot, rewrites) => {
      state.opens.push({ snapshot, rewrites });
      return ok({
        imported: state.openImported
          ? { tables: { cache_entries: 2 }, totalRows: 2, checksum: 'f'.repeat(64) }
          : null,
      });
    },
    rewritePointers: async (rewrites) => {
      state.rewritten.push([...rewrites]);
      return rewrites.length;
    },
  };
  return state;
}

describe('pageStoreKeyForKey', () => {
  it('keeps page keys and moves covers under the page prefix', () => {
    expect(pageStoreKeyForKey(PAGE_KEY)).toBe(PAGE_KEY);
    expect(pageStoreKeyForKey(COVER_KEY)).toBe(`page:${COVER_KEY}`);
  });
});

describe('moveRendererBlobs', () => {
  it('moves pages and covers, rewrites only cover pointers, and verifies every digest', async () => {
    const idb = seededIdb();
    const moved = await moveRendererBlobs(idb.deps);

    expect(moved.pages).toBe(1);
    expect(moved.covers).toBe(2);
    expect(moved.totalBytes).toBe(bytes(1).length + bytes(9).length + bytes(5).length);
    expect(moved.rewrites).toEqual([
      { id: COVER_KEY, blobKey: `page:${COVER_KEY}` },
      { id: CUSTOM_COVER_KEY, blobKey: `page:${CUSTOM_COVER_KEY}` },
    ]);
    expect(idb.putCalls).toEqual([PAGE_KEY, `page:${COVER_KEY}`, `page:${CUSTOM_COVER_KEY}`]);
    // Every inventory entry carries the source hash.
    expect(moved.inventory[0]).toEqual({
      key: PAGE_KEY,
      mimeType: 'image/jpeg',
      byteSize: 4,
      sha256: await hash(bytes(1)),
    });
    // Nothing is deleted: the old IndexedDB copy stays until the verified marker.
    expect([...idb.records.keys()]).toEqual(
      expect.arrayContaining([PAGE_KEY, COVER_KEY, CUSTOM_COVER_KEY]),
    );
  });

  it('fails when the store reports different bytes, leaving every old blob in place', async () => {
    const idb = seededIdb();
    idb.tamperFor = PAGE_KEY;
    await expect(moveRendererBlobs(idb.deps)).rejects.toThrow(/does not match its source/);
    expect([...idb.records.keys()]).toEqual(
      expect.arrayContaining([PAGE_KEY, COVER_KEY, CUSTOM_COVER_KEY]),
    );
  });
});

describe('runRendererDataImport', () => {
  it('moves blobs first, then lets the verified snapshot import rewrite the pointers', async () => {
    resetRendererImportState();
    const idb = seededIdb();
    const state = harness(idb);

    const outcome = await runRendererDataImport(state.deps);

    expect(outcome.status).toBe('complete');
    expect(state.opens).toHaveLength(1);
    expect(state.opens[0]?.rewrites).toEqual([
      { id: COVER_KEY, blobKey: `page:${COVER_KEY}` },
      { id: CUSTOM_COVER_KEY, blobKey: `page:${CUSTOM_COVER_KEY}` },
    ]);
    expect(state.rewritten).toEqual([]);
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]?.database?.totalRows).toBe(2);
    expect(Object.keys(state.reports[0]?.blobs.checksums ?? {})).toHaveLength(3);
    expect(getRendererImportState()).toMatchObject({ phase: 'complete', errorMessage: null });
  });

  it('runs only once: a recorded marker skips the move entirely', async () => {
    resetRendererImportState();
    const idb = seededIdb();
    const state = harness(idb);
    state.completed = true;

    expect(await runRendererDataImport(state.deps)).toEqual({ status: 'skipped' });
    expect(idb.putCalls).toEqual([]);
    expect(state.opens).toEqual([]);
    expect(state.reports).toEqual([]);
    expect(getRendererImportState().phase).toBe('skipped');
  });

  it('a blob write failure leaves no marker, opens nothing and keeps the old data', async () => {
    resetRendererImportState();
    const idb = seededIdb();
    idb.failPutFor = `page:${COVER_KEY}`;
    const state = harness(idb);

    const outcome = await runRendererDataImport(state.deps);

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.hostOpened).toBe(false);
    expect(state.opens).toEqual([]);
    expect(state.reports).toEqual([]);
    expect([...idb.records.keys()]).toEqual(expect.arrayContaining([COVER_KEY, CUSTOM_COVER_KEY]));
    expect(getRendererImportState()).toMatchObject({
      phase: 'failed',
      errorMessage: expect.stringContaining('disk is full'),
    });
  });

  it('a database import failure leaves the old data and reports the typed reason', async () => {
    resetRendererImportState();
    const idb = seededIdb();
    const state = harness(idb);
    const deps: RendererImportDeps = {
      ...state.deps,
      openHost: async () =>
        err(createAppError({ code: 'data-host.import_failed', message: 'foreign key broken' })),
    };

    const outcome = await runRendererDataImport(deps);

    expect(outcome.status).toBe('failed');
    expect(state.reports).toEqual([]);
    expect([...idb.records.keys()]).toEqual(expect.arrayContaining([COVER_KEY]));
    expect(getRendererImportState().errorMessage).toContain('foreign key broken');
  });

  it('rewrites pointers on an already-imported native database', async () => {
    resetRendererImportState();
    const idb = seededIdb();
    const state = harness(idb);
    state.openImported = false;

    expect((await runRendererDataImport(state.deps)).status).toBe('complete');
    expect(state.rewritten).toEqual([
      [
        { id: COVER_KEY, blobKey: `page:${COVER_KEY}` },
        { id: CUSTOM_COVER_KEY, blobKey: `page:${CUSTOM_COVER_KEY}` },
      ],
    ]);
  });

  it('a hash mismatch records no marker', async () => {
    resetRendererImportState();
    const idb = seededIdb();
    idb.tamperFor = `page:${COVER_KEY}`;
    const state = harness(idb);

    const outcome = await runRendererDataImport(state.deps);

    expect(outcome.status).toBe('failed');
    expect(state.reports).toEqual([]);
    expect(state.opens).toEqual([]);
  });

  it('a user retry after a failure completes and records the marker once', async () => {
    resetRendererImportState();
    const idb = seededIdb();
    idb.failPutFor = PAGE_KEY;
    const state = harness(idb);

    expect((await runRendererDataImport(state.deps)).status).toBe('failed');
    expect(state.reports).toEqual([]);

    idb.failPutFor = null;
    expect((await runRendererDataImport(state.deps)).status).toBe('complete');
    expect(state.reports).toHaveLength(1);
    expect(getRendererImportState().phase).toBe('complete');
  });
});

describe('buildOldDataExport', () => {
  it('exports the snapshot bytes and a blob inventory while an import is failing', async () => {
    const idb = seededIdb();
    const exported = await buildOldDataExport({
      readSnapshot: async () => ({ bytes: bytes(7), version: 3 }),
      listKeys: async () => [...idb.records.keys()],
      readBlob: idb.deps.readBlob,
      sha256: hash,
      now: () => new Date('2026-01-02T03:04:05.000Z'),
    });

    expect(exported).toMatchObject({ version: 1, exportedAt: '2026-01-02T03:04:05.000Z' });
    expect(exported.snapshot).toMatchObject({
      version: 3,
      byteSize: 4,
      sha256: await hash(bytes(7)),
    });
    expect(atob(exported.snapshot!.base64)).toBe(String.fromCharCode(...bytes(7)));
    expect(exported.blobs.map((blob) => blob.key)).toEqual([PAGE_KEY, COVER_KEY, CUSTOM_COVER_KEY]);
  });
});

describe('renderer import state', () => {
  it('notifies subscribers and can be reset for a retry', async () => {
    resetRendererImportState();
    const listener = vi.fn<() => void>();
    const { subscribeRendererImport } = await import('../renderer-data-import.js');
    const unsubscribe = subscribeRendererImport(listener);
    const idb = seededIdb();
    idb.failPutFor = PAGE_KEY;
    await runRendererDataImport(harness(idb).deps);
    expect(listener).toHaveBeenCalled();
    expect(getRendererImportState().phase).toBe('failed');
    resetRendererImportState();
    expect(getRendererImportState().phase).toBe('idle');
    unsubscribe();
  });
});
