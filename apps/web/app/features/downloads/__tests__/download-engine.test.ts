// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ok, type AppResult } from '@app/shared';
import { platformStorageFull } from '@app/platform';
import {
  listCachedChapterPageIndexes,
  prefetchChapterPages,
  CACHE_RETENTION_DOWNLOAD,
} from '@app/cache';
import type { PlatformAdapter } from '@app/platform';
import type { Chapter } from '@app/shared';
import { toChapterId, toChapterPageId, toMangaId, toProviderId } from '@app/shared';
import { createSqlJsHarness } from '@app/db/testing';
import { getDownload, listDownloads, summarizeCacheStorage, upsertDownload } from '@app/db';

import { createDownloadEngine, type DownloadChapterSource } from '../download-engine.js';

const MANGA_ID = toMangaId('manga-1');
const CHAPTER_ID = toChapterId('chapter-1');
const PROVIDER_ID = toProviderId('mangadex');

function chapter(pageCount: number): Chapter {
  return {
    id: CHAPTER_ID,
    mangaId: MANGA_ID,
    providerId: PROVIDER_ID,
    title: 'Chapter 1',
    index: 1,
    pages: Array.from({ length: pageCount }, (_value, index) => ({
      id: toChapterPageId(`page-${index}`),
      index,
      image: { url: `https://example.com/pages/${index}.jpg` },
    })),
  };
}

interface AdapterOptions {
  readonly failPutAt?: number;
  readonly failFetchFor?: (url: string) => boolean;
  readonly gateFetches?: () => { readonly wait: Promise<void>; readonly release: () => void };
}

function createAdapter(options: AdapterOptions = {}): {
  adapter: PlatformAdapter;
  fetches: () => number;
  peakFetches: () => number;
  bytes: () => number;
  blobs: () => number;
} {
  const blobs = new Map<string, ArrayBuffer>();
  let fetches = 0;
  let puts = 0;
  let inFlight = 0;
  let peak = 0;
  let bytes = 0;
  const gate = options.gateFetches?.();

  return {
    adapter: {
      blobStorage: {
        put: async (key: string, data: ArrayBuffer) => {
          puts += 1;
          if (options.failPutAt !== undefined && puts === options.failPutAt) {
            return {
              ok: false as const,
              error: platformStorageFull('This device is out of storage.'),
            };
          }
          blobs.set(key, data);
          bytes += data.byteLength;
          return ok(undefined);
        },
        get: async (key: string) => {
          const data = blobs.get(key);
          return ok(data === undefined ? undefined : { data, mimeType: 'image/jpeg' });
        },
        delete: async (key: string) => {
          const data = blobs.get(key);
          if (data !== undefined) bytes -= data.byteLength;
          blobs.delete(key);
          return ok(undefined);
        },
        listKeys: async () => ok([...blobs.keys()]),
        createObjectUrl: async () => ok('blob:page'),
        revokeObjectUrl: async () => ok(undefined),
      },
      providerNetwork: {},
      network: {
        fetchBytes: async (
          url: string,
        ): Promise<AppResult<{ data: ArrayBuffer; mimeType: string }>> => {
          fetches += 1;
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          try {
            if (gate !== undefined) await gate.wait;
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (options.failFetchFor?.(url) === true) {
              return { ok: false as const, error: { code: 'network.failed', message: 'offline' } };
            }
            return ok({ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/jpeg' });
          } finally {
            inFlight -= 1;
          }
        },
      },
    } as unknown as PlatformAdapter,
    fetches: () => fetches,
    peakFetches: () => peak,
    bytes: () => bytes,
    blobs: () => blobs.size,
  };
}

function engineFor(
  db: Parameters<typeof getDownload>[0],
  adapter: PlatformAdapter,
  source: DownloadChapterSource,
  overrides: { readonly onStorageFull?: (row: { chapterId: string; status: string }) => void } = {},
) {
  const onChanged = vi.fn<() => void>();
  const onStorageFull = vi.fn<(row: { chapterId: string; status: string }) => void>(
    overrides.onStorageFull ?? (() => {}),
  );
  const engine = createDownloadEngine({
    db,
    adapter,
    readChapter: async () => source,
    loadChapter: async () => source,
    onChanged,
    onStorageFull,
  });
  return { engine, onChanged, onStorageFull };
}

async function waitForStatus(db: Parameters<typeof getDownload>[0], status: string): Promise<void> {
  await vi.waitFor(
    async () => {
      expect((await getDownload(db, CHAPTER_ID))?.status).toBe(status);
    },
    { timeout: 5_000, interval: 10 },
  );
}

describe('download engine', () => {
  it('Given a chapter, When downloaded, Then every page is stored with the download retention and progress is complete', async () => {
    const { db } = await createSqlJsHarness();
    const store = createAdapter();
    const source = { chapter: chapter(6), providerId: PROVIDER_ID };
    const { engine, onChanged } = engineFor(db, store.adapter, source);

    await engine.enqueue(CHAPTER_ID);
    await waitForStatus(db, 'complete');

    const row = await getDownload(db, CHAPTER_ID);
    expect(row).toMatchObject({
      status: 'complete',
      pageCount: 6,
      completedPages: 6,
      failedPageIndexes: [],
      attempts: 1,
    });
    expect(row?.completedAt).toBeDefined();
    expect(
      await listCachedChapterPageIndexes(db, {
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
      }),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(onChanged).toHaveBeenCalled();
    // A repeated enqueue while nothing is wrong is a no-op.
    await engine.enqueue(CHAPTER_ID);
    expect((await getDownload(db, CHAPTER_ID))?.status).toBe('complete');
    expect(store.fetches()).toBe(6);
  });

  it('Given pages already stored and a downloading row, When the app reopens, Then only the missing pages are fetched', async () => {
    const { db } = await createSqlJsHarness();
    const store = createAdapter();
    const source = { chapter: chapter(10), providerId: PROVIDER_ID };
    await prefetchChapterPages({
      db,
      adapter: store.adapter,
      providerId: 'mangadex',
      mangaId: 'manga-1',
      chapterId: 'chapter-1',
      pages: chapter(10)
        .pages.slice(0, 4)
        .map((page) => ({
          pageIndex: page.index,
          remoteUrl: page.image.url,
        })),
      retention: CACHE_RETENTION_DOWNLOAD,
    });
    await upsertDownload(db, {
      chapterId: CHAPTER_ID,
      mangaId: MANGA_ID,
      providerId: PROVIDER_ID,
      status: 'downloading',
      pageCount: 10,
      completedPages: 4,
      attempts: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const before = store.fetches();
    const { engine } = engineFor(db, store.adapter, source);
    engine.start();
    await waitForStatus(db, 'complete');

    expect(store.fetches() - before).toBe(6);
    expect((await getDownload(db, CHAPTER_ID))?.completedPages).toBe(10);
    expect((await getDownload(db, CHAPTER_ID))?.attempts).toBe(2);
  });

  it('Given one page keeps failing, When attempts run out, Then it is recorded and the rest is kept', async () => {
    const { db } = await createSqlJsHarness();
    const store = createAdapter({ failFetchFor: (url) => url.endsWith('/2.jpg') });
    const source = { chapter: chapter(6), providerId: PROVIDER_ID };
    const { engine } = engineFor(db, store.adapter, source);

    await engine.enqueue(CHAPTER_ID);
    await waitForStatus(db, 'partial');

    const row = await getDownload(db, CHAPTER_ID);
    expect(row).toMatchObject({
      status: 'partial',
      pageCount: 6,
      completedPages: 5,
      failedPageIndexes: [2],
      lastErrorCode: 'network',
    });
    expect(
      await listCachedChapterPageIndexes(db, {
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
      }),
    ).toEqual([0, 1, 3, 4, 5]);
  });

  it('Given a partial download and a recovered provider, When retried, Then it keeps what it had and finishes', async () => {
    const { db } = await createSqlJsHarness();
    let fail = true;
    const store = createAdapter({ failFetchFor: (url) => fail && url.endsWith('/2.jpg') });
    const source = { chapter: chapter(6), providerId: PROVIDER_ID };
    const { engine } = engineFor(db, store.adapter, source);
    await engine.enqueue(CHAPTER_ID);
    await waitForStatus(db, 'partial');

    fail = false;
    const before = store.fetches();
    await engine.retry(CHAPTER_ID);
    await waitForStatus(db, 'complete');

    // Only the missing page was fetched on the retry.
    expect(store.fetches() - before).toBe(1);
    expect((await getDownload(db, CHAPTER_ID))?.failedPageIndexes).toEqual([]);
  });

  it('Given a running download, When the user cancels, Then it stops and keeps the pages already saved', async () => {
    const { db } = await createSqlJsHarness();
    let release!: () => void;
    const gate = {
      wait: new Promise<void>((resolve) => (release = resolve)),
      release: () => release(),
    };
    const store = createAdapter({ gateFetches: () => gate });
    const source = { chapter: chapter(12), providerId: PROVIDER_ID };
    const { engine } = engineFor(db, store.adapter, source);

    await engine.enqueue(CHAPTER_ID);
    await vi.waitFor(() => expect(store.fetches()).toBeGreaterThan(0));
    const cancelling = engine.cancel(CHAPTER_ID);
    release();
    await cancelling;

    expect((await getDownload(db, CHAPTER_ID))?.status).toBe('cancelled');
    expect((await getDownload(db, CHAPTER_ID))?.lastErrorCode).toBe('user-cancelled');
    // Nothing was requested past the pages that were already in flight.
    expect(store.fetches()).toBeLessThan(12);
  });

  it('Given a cancel while the provider page list is loading, When it returns, Then the cancel is not overwritten', async () => {
    const { db } = await createSqlJsHarness();
    const store = createAdapter();
    const source = { chapter: chapter(6), providerId: PROVIDER_ID };
    let started = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const engine = createDownloadEngine({
      db,
      adapter: store.adapter,
      readChapter: async () => source,
      loadChapter: async () => {
        started = true;
        await gate;
        return source;
      },
    });

    await engine.enqueue(CHAPTER_ID);
    await vi.waitFor(() => expect(started).toBe(true));
    const cancelling = engine.cancel(CHAPTER_ID);
    release();
    await cancelling;

    expect((await getDownload(db, CHAPTER_ID))?.status).toBe('cancelled');
    expect(
      await listCachedChapterPageIndexes(db, {
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
      }),
    ).toEqual([]);
    expect(store.fetches()).toBe(0);
  });

  it('Given a full disk, When a page save fails, Then the download is failed with a storage code and every saved page is kept', async () => {
    const { db } = await createSqlJsHarness();
    const store = createAdapter({ failPutAt: 2 });
    const source = { chapter: chapter(12), providerId: PROVIDER_ID };
    const { engine, onStorageFull } = engineFor(db, store.adapter, source);

    await engine.enqueue(CHAPTER_ID);
    await waitForStatus(db, 'failed');

    const row = await getDownload(db, CHAPTER_ID);
    expect(row).toMatchObject({ status: 'failed', lastErrorCode: 'storage-full' });
    expect(row?.completedPages).toBeGreaterThan(0);
    expect(row?.completedPages).toBeLessThan(12);
    expect(row?.failedPageIndexes).toHaveLength(12 - (row?.completedPages ?? 0));
    expect(onStorageFull).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: CHAPTER_ID,
        status: 'failed',
        lastErrorCode: 'storage-full',
      }),
    );
    expect(
      await listCachedChapterPageIndexes(db, {
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
      }),
    ).toHaveLength(row?.completedPages ?? 0);
  });

  it('Given a downloaded chapter, When removed, Then its pages, blobs and row are gone and the bytes are reported', async () => {
    const { db } = await createSqlJsHarness();
    const store = createAdapter();
    const source = { chapter: chapter(6), providerId: PROVIDER_ID };
    const { engine } = engineFor(db, store.adapter, source);
    await engine.enqueue(CHAPTER_ID);
    await waitForStatus(db, 'complete');

    expect(await engine.remove(CHAPTER_ID)).toEqual({ removedPages: 6, removedBytes: 18 });

    expect(await getDownload(db, CHAPTER_ID)).toBeUndefined();
    expect(await listDownloads(db)).toEqual([]);
    expect(
      await listCachedChapterPageIndexes(db, {
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
      }),
    ).toEqual([]);
    expect(store.blobs()).toBe(0);
    expect((await summarizeCacheStorage(db)).totalCount).toBe(0);
  });

  it('Given a long chapter, When downloading, Then page fetches stay bounded', async () => {
    const { db } = await createSqlJsHarness();
    const store = createAdapter();
    const source = { chapter: chapter(16), providerId: PROVIDER_ID };
    const { engine } = engineFor(db, store.adapter, source);
    await engine.enqueue(CHAPTER_ID);
    await waitForStatus(db, 'complete');
    expect(store.peakFetches()).toBeLessThanOrEqual(4);
  });
});
