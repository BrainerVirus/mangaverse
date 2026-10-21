import { describe, expect, it } from 'vitest';
import { ok } from '@app/shared';
import type { PlatformAdapter } from '@app/platform';
import { createSqlJsHarness } from '@app/db/testing';

import {
  listCachedChapterPageIndexes,
  markChapterPagesAsRead,
  prefetchChapterPages,
  resolvePageObjectUrl,
  runPrefetchQueue,
} from './page-cache-store.js';
import { listCacheEntriesForManga } from '@app/db';

/** Only `blobStorage` and `network` are touched by the page cache store. */
function createPageAdapter(): {
  adapter: PlatformAdapter;
  peakFetches: () => number;
  calls: {
    readonly createObjectUrl: () => number;
    readonly get: () => number;
    readonly put: () => number;
    readonly fetch: () => number;
  };
} {
  const blobs = new Map<string, { data: ArrayBuffer; mimeType: string }>();
  let inFlight = 0;
  let peak = 0;
  let creates = 0;
  let gets = 0;
  let puts = 0;
  let fetches = 0;

  return {
    adapter: {
      blobStorage: {
        put: async (key: string, data: ArrayBuffer, mimeType: string) => {
          puts += 1;
          blobs.set(key, { data, mimeType });
          return ok(undefined);
        },
        get: async (key: string) => {
          gets += 1;
          return ok(blobs.get(key));
        },
        delete: async (key: string) => {
          blobs.delete(key);
          return ok(undefined);
        },
        createObjectUrl: async (_data: ArrayBuffer, _mimeType: string) => {
          creates += 1;
          return ok(`blob:page-${blobs.size}`);
        },
        revokeObjectUrl: async (_url: string) => ok(undefined),
      },
      network: {
        fetchBytes: async () => {
          fetches += 1;
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          // Yield so every queued page overlaps the ones already in flight.
          await new Promise((resolve) => setTimeout(resolve, 0));
          inFlight -= 1;
          return ok({ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/jpeg' });
        },
      },
    } as unknown as PlatformAdapter,
    peakFetches: () => peak,
    calls: {
      createObjectUrl: () => creates,
      get: () => gets,
      put: () => puts,
      fetch: () => fetches,
    },
  };
}

const CHAPTER = {
  providerId: 'mangadex',
  mangaId: 'dev-md-abc',
  chapterId: 'dev-md-ch-1',
};

describe('page cache store', () => {
  it('Given a long chapter, When prefetching, Then pages are fetched with a bounded fan-out', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, peakFetches } = createPageAdapter();
    const pages = Array.from({ length: 12 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/x${pageIndex + 1}.jpg`,
    }));

    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages });

    expect(peakFetches()).toBeLessThanOrEqual(4);
    // Bounded must not mean truncated: the whole chapter still ends up local.
    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toEqual(pages.map((p) => p.pageIndex));
  });

  it('Given a byte budget, When prefetching, Then new fetches stop once the budget is spent', async () => {
    const pages = Array.from({ length: 10 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/budget${pageIndex}.jpg`,
    }));
    const resolved: number[] = [];

    const outcome = await runPrefetchQueue({
      pages,
      budgetBytes: 1,
      resolvePage: async (page) => {
        resolved.push(page.pageIndex);
        return { fromCache: false, byteSize: 1024 };
      },
    });

    // Only the four fetches already in flight when the budget is hit are issued.
    expect(resolved).toEqual([0, 1, 2, 3]);
    expect(outcome.downloadedBytes).toBe(4 * 1024);
  });

  it('Given cache hits, When prefetching, Then they do not consume the download budget', async () => {
    const pages = Array.from({ length: 8 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/mixed${pageIndex}.jpg`,
    }));
    const resolved: number[] = [];

    const outcome = await runPrefetchQueue({
      pages,
      budgetBytes: 1500,
      resolvePage: async (page) => {
        resolved.push(page.pageIndex);
        return page.pageIndex < 4
          ? { fromCache: true, byteSize: 100_000 }
          : { fromCache: false, byteSize: 1000 };
      },
    });

    expect(resolved).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // 4 cached pages at 100 kB each would be 400 kB; only the fresh 4 kB counts.
    expect(outcome.downloadedBytes).toBe(4 * 1000);
  });

  it('Given a page fetched once, When resolving it again, Then both paths report the cache flag and byte size', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    const page = {
      db,
      adapter,
      ...CHAPTER,
      pageIndex: 0,
      remoteUrl: 'https://uploads.mangadex.org/bytes.jpg',
    };

    const fresh = await resolvePageObjectUrl(page);
    expect(fresh).toMatchObject({ fromCache: false, byteSize: 3 });

    const cached = await resolvePageObjectUrl(page);
    expect(cached).toMatchObject({ fromCache: true, byteSize: 3 });
  });

  it('Given an unlimited budget, When prefetching, Then every page is fetched', async () => {
    const pages = Array.from({ length: 12 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/unlimited${pageIndex}.jpg`,
    }));
    const resolved: number[] = [];

    const outcome = await runPrefetchQueue({
      pages,
      budgetBytes: 0,
      resolvePage: async (page) => {
        resolved.push(page.pageIndex);
        return { fromCache: false, byteSize: 1024 * 1024 };
      },
    });

    expect(resolved).toHaveLength(12);
    expect(outcome.downloadedBytes).toBe(12 * 1024 * 1024);
  });

  it('Given a partially cached chapter, When listing its cached pages, Then only stored indexes come back', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages: [
        { pageIndex: 0, remoteUrl: 'https://uploads.mangadex.org/x1.jpg' },
        { pageIndex: 2, remoteUrl: 'https://uploads.mangadex.org/x3.jpg' },
      ],
    });
    await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      chapterId: 'dev-md-ch-other',
      pages: [{ pageIndex: 0, remoteUrl: 'https://uploads.mangadex.org/y1.jpg' }],
    });

    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toEqual([0, 2]);
  });

  it('Given prefetched pages, When prefetching runs, Then no object URL is created or leaked', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, calls } = createPageAdapter();
    const pages = Array.from({ length: 12 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/urls${pageIndex}.jpg`,
    }));

    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages, retention: 'read' });

    expect(calls.createObjectUrl()).toBe(0);
    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toHaveLength(12);
  });

  it('Given already cached pages, When prefetching again, Then it reads metadata only and touches nothing', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, calls } = createPageAdapter();
    const pages = Array.from({ length: 5 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/repeat${pageIndex}.jpg`,
    }));
    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages, retention: 'read' });
    const before = (await listCacheEntriesForManga(db, CHAPTER.providerId, CHAPTER.mangaId)).map(
      (entry) => ({ id: entry.id, lastAccessAt: entry.lastAccessAt }),
    );

    const putsBefore = calls.put();
    const getsBefore = calls.get();
    const fetchesBefore = calls.fetch();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages, retention: 'read' });

    expect(calls.put()).toBe(putsBefore);
    expect(calls.get()).toBe(getsBefore);
    expect(calls.fetch()).toBe(fetchesBefore);
    expect(calls.createObjectUrl()).toBe(0);
    expect(
      (await listCacheEntriesForManga(db, CHAPTER.providerId, CHAPTER.mangaId)).map((entry) => ({
        id: entry.id,
        lastAccessAt: entry.lastAccessAt,
      })),
    ).toEqual(before);
  });

  it('Given pages already marked read, When marking again, Then no row is written', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    const pages = Array.from({ length: 3 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/mark${pageIndex}.jpg`,
    }));
    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages, retention: 'read' });
    await markChapterPagesAsRead(db, CHAPTER);
    const first = await listCacheEntriesForManga(db, CHAPTER.providerId, CHAPTER.mangaId);
    expect(first.map((entry) => entry.metadata?.retention)).toEqual(['read', 'read', 'read']);
    const accessBefore = new Map(first.map((entry) => [entry.id, entry.lastAccessAt]));

    await new Promise((resolve) => setTimeout(resolve, 5));
    await markChapterPagesAsRead(db, CHAPTER);

    const accessAfter = new Map(
      (await listCacheEntriesForManga(db, CHAPTER.providerId, CHAPTER.mangaId)).map((entry) => [
        entry.id,
        entry.lastAccessAt,
      ]),
    );
    expect(accessAfter).toEqual(accessBefore);
  });

  it('Given an aborted prefetch, When the fetch resolves, Then it does not store the page', async () => {
    const { db } = await createSqlJsHarness();
    let resolveFetch!: (value: unknown) => void;
    const putCalls: string[] = [];
    const adapter = {
      blobStorage: {
        put: async (key: string) => {
          putCalls.push(key);
          return ok(undefined);
        },
        get: async () => ok(undefined),
        delete: async () => ok(undefined),
        createObjectUrl: async () => ok('blob:page'),
        revokeObjectUrl: async () => ok(undefined),
      },
      network: {
        fetchBytes: () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      },
    } as unknown as PlatformAdapter;
    const controller = new AbortController();

    const prefetch = prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages: [{ pageIndex: 0, remoteUrl: 'https://uploads.mangadex.org/abort.jpg' }],
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    resolveFetch({ data: new Uint8Array([1]).buffer, mimeType: 'image/jpeg' });
    await prefetch;

    expect(putCalls).toEqual([]);
    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toEqual([]);
  });
});
