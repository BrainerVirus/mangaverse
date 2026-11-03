import { describe, expect, it, vi } from 'vitest';
import { err, ok, type AppResult } from '@app/shared';
import {
  platformStorageFull,
  type PlatformAdapter,
  type PlatformNetworkFetchOptions,
} from '@app/platform';
import { createSqlJsHarness } from '@app/db/testing';

import {
  listCachedChapterPageIndexes,
  markChapterPagesAsRead,
  markChapterPagesDownloaded,
  prefetchChapterPages,
  removeChapterPageEntries,
  resolvePageObjectUrl,
  runPrefetchQueue,
  summarizeDownloadCache,
} from './page-cache-store.js';
import { listCacheEntriesForManga } from '@app/db';
import { CACHE_RETENTION_DOWNLOAD, CACHE_RETENTION_READ } from './constants.js';

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
      providerNetwork: {},
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

  it('Given a cached row whose blob is gone, When listing complete pages, Then the page is not counted', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    const pages = Array.from({ length: 3 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/missing${pageIndex}.jpg`,
    }));
    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages });

    const entries = await listCacheEntriesForManga(db, CHAPTER.providerId, CHAPTER.mangaId);
    const middle = entries.find((entry) => entry.metadata?.pageIndex === 1);
    if (middle?.blobKey === undefined) throw new Error('expected a cached blob key for page 1');
    await adapter.blobStorage.delete(middle.blobKey);

    // A row alone is a hint; with the adapter, a missing blob is not a finished page.
    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toEqual([0, 1, 2]);
    expect(await listCachedChapterPageIndexes(db, { ...CHAPTER, adapter })).toEqual([0, 2]);
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
        return { status: 'fetched', byteSize: 1024 };
      },
    });

    // Only the four fetches already in flight when the budget is hit are issued.
    expect(resolved).toEqual([0, 1, 2, 3]);
    expect(outcome.downloadedBytes).toBe(4 * 1024);
  });

  it('Given mixed outcomes, When prefetching, Then cached, fetched and failed pages are counted', async () => {
    const pages = Array.from({ length: 4 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/outcome${pageIndex}.jpg`,
    }));
    const outcome = await runPrefetchQueue({
      pages,
      budgetBytes: 0,
      resolvePage: async (page) =>
        page.pageIndex === 0
          ? { status: 'cached', byteSize: 90 }
          : page.pageIndex === 1
            ? { status: 'fetched', byteSize: 100 }
            : page.pageIndex === 2
              ? { status: 'failed', failure: { code: 'network', message: 'nope' } }
              : { status: 'fetched', byteSize: 50 },
    });

    expect(outcome).toMatchObject({
      cachedPages: 1,
      fetchedPages: 2,
      failedPages: 1,
      downloadedBytes: 150,
    });
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
          ? { status: 'cached', byteSize: 100_000 }
          : { status: 'fetched', byteSize: 1000 };
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
        return { status: 'fetched', byteSize: 1024 * 1024 };
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
    const { db, raw } = await createSqlJsHarness();
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
    const statements: string[] = [];
    const prepare = raw.prepare.bind(raw);
    raw.prepare = (sql: string) => {
      statements.push(sql);
      return prepare(sql);
    };
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages, retention: 'read' });

    // Only the chapter-scoped index read runs; no per-page existence check.
    expect(new Set(statements).size).toBe(1);
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
      providerNetwork: {},
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

/** Desktop's shape: the store keeps page bytes itself and serves them by URL. */
function createUrlServingAdapter() {
  const files = new Map<string, ArrayBuffer>();
  let objectUrls = 0;
  let reads = 0;
  const adapter = {
    blobStorage: {
      put: async (key: string, data: ArrayBuffer) => {
        files.set(key, data);
        return ok(undefined);
      },
      get: async () => {
        reads += 1;
        return ok(undefined);
      },
      delete: async (key: string) => {
        files.delete(key);
        return ok(undefined);
      },
      listKeys: async () => ok([...files.keys()]),
      createObjectUrl: async () => {
        objectUrls += 1;
        return ok('blob:unexpected');
      },
      revokeObjectUrl: async () => ok(undefined),
      resolveUrl: async (key: string) =>
        ok(files.has(key) ? `page://store/${encodeURIComponent(key).length}` : undefined),
    },
    providerNetwork: {},
    network: {
      fetchBytes: async () =>
        ok({ data: new Uint8Array([0xff, 0xd8, 0xff]).buffer, mimeType: 'image/jpeg' }),
    },
  } as unknown as PlatformAdapter;
  return { adapter, files, objectUrls: () => objectUrls, reads: () => reads };
}

describe('page cache store with a URL-serving store', () => {
  const page = (
    db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'],
    adapter: PlatformAdapter,
  ) => ({
    db,
    adapter,
    ...CHAPTER,
    pageIndex: 0,
    remoteUrl: 'https://uploads.mangadex.org/served.jpg',
  });

  it('Given a fetched page, When resolving it, Then the store URL is used and no bytes are read back or wrapped', async () => {
    const { db } = await createSqlJsHarness();
    const store = createUrlServingAdapter();

    const fresh = await resolvePageObjectUrl(page(db, store.adapter));
    expect(fresh).toMatchObject({ fromCache: false, byteSize: 3 });
    expect(fresh?.objectUrl).toMatch(/^page:\/\/store\//);

    const cached = await resolvePageObjectUrl(page(db, store.adapter));
    expect(cached).toEqual({ objectUrl: fresh?.objectUrl, fromCache: true, byteSize: 3 });
    expect(store.objectUrls()).toBe(0);
    expect(store.reads()).toBe(0);
  });

  it('Given a row whose file is gone, When resolving, Then the page is fetched and stored again', async () => {
    const { db } = await createSqlJsHarness();
    const store = createUrlServingAdapter();
    await resolvePageObjectUrl(page(db, store.adapter));
    store.files.clear();

    const again = await resolvePageObjectUrl(page(db, store.adapter));
    expect(again).toMatchObject({ fromCache: false });
    expect(store.files.size).toBe(1);
  });
});

/** Desktop's newest shape: main fetches and stores, returning only URL and size. */
function createMainStoreAdapter() {
  const files = new Map<string, { data: ArrayBuffer; mimeType: string }>();
  let fetchBytes = 0;
  let puts = 0;
  let objectUrls = 0;
  const adapter = {
    blobStorage: {
      put: async () => {
        puts += 1;
        return ok(undefined);
      },
      get: async () => ok(undefined),
      delete: async (key: string) => {
        files.delete(key);
        return ok(undefined);
      },
      listKeys: async () => ok([...files.keys()]),
      createObjectUrl: async () => {
        objectUrls += 1;
        return ok('blob:unexpected');
      },
      revokeObjectUrl: async () => ok(undefined),
      resolveUrl: async (key: string) =>
        ok(files.has(key) ? `page://store/${key.length}` : undefined),
    },
    providerNetwork: {
      async fetchAndStore(input: { url: string; key: string }) {
        if (input.url.includes('fail')) return ok(undefined);
        files.set(input.key, {
          data: new Uint8Array([0xff, 0xd8, 0xff]).buffer,
          mimeType: 'image/jpeg',
        });
        return ok({ url: `page://store/${input.key.length}`, mimeType: 'image/jpeg', byteSize: 3 });
      },
    },
    network: {
      fetchBytes: async () => {
        fetchBytes += 1;
        return ok({ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/jpeg' });
      },
    },
  } as unknown as PlatformAdapter;
  return {
    adapter,
    files,
    fetchBytesCalled: () => fetchBytes,
    puts: () => puts,
    objectUrls: () => objectUrls,
  };
}

describe('page cache store with a main-side fetch-and-store', () => {
  const page = (
    db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'],
    adapter: PlatformAdapter,
    remoteUrl = 'https://uploads.mangadex.org/page.jpg',
  ) => ({
    db,
    adapter,
    ...CHAPTER,
    pageIndex: 0,
    remoteUrl,
  });

  it('Given a page, When resolving it, Then only main metadata and a page:// URL reach the renderer', async () => {
    const { db } = await createSqlJsHarness();
    const store = createMainStoreAdapter();

    const fresh = await resolvePageObjectUrl(page(db, store.adapter));

    expect(fresh).toMatchObject({ fromCache: false, byteSize: 3 });
    expect(fresh?.objectUrl).toMatch(/^page:\/\/store\//);
    expect(store.fetchBytesCalled()).toBe(0);
    expect(store.puts()).toBe(0);
    expect(store.objectUrls()).toBe(0);
    expect([...store.files.keys()]).toEqual(['page:mangadex:dev-md-abc:dev-md-ch-1:0']);

    const cached = await resolvePageObjectUrl(page(db, store.adapter));
    expect(cached).toEqual({ objectUrl: fresh?.objectUrl, fromCache: true, byteSize: 3 });
    expect(store.fetchBytesCalled()).toBe(0);
  });

  it('Given prefetch, When main stores the page, Then no bytes or object URL are produced', async () => {
    const { db } = await createSqlJsHarness();
    const store = createMainStoreAdapter();

    const outcome = await prefetchChapterPages({
      db,
      adapter: store.adapter,
      ...CHAPTER,
      pages: [{ pageIndex: 0, remoteUrl: 'https://uploads.mangadex.org/page.jpg' }],
    });

    expect(outcome).toMatchObject({ fetchedPages: 1, cachedPages: 0, failedPages: 0 });
    expect(outcome.downloadedBytes).toBe(3);
    expect(store.fetchBytesCalled()).toBe(0);
    expect(store.objectUrls()).toBe(0);
    expect(store.puts()).toBe(0);
    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toEqual([0]);
  });

  it('Given a main-store failure, When resolving, Then it does not fall back to fetching bytes', async () => {
    const { db } = await createSqlJsHarness();
    const store = createMainStoreAdapter();

    const result = await resolvePageObjectUrl(
      page(db, store.adapter, 'https://uploads.mangadex.org/fail.jpg'),
    );

    expect(result).toBeUndefined();
    expect(store.fetchBytesCalled()).toBe(0);
    expect(store.puts()).toBe(0);
  });

  it('Given a web adapter that refuses the provider host, When resolving a page, Then no bytes are fetched', async () => {
    const { db } = await createSqlJsHarness();
    const base = createPageAdapter().adapter;
    const fetchBytes = vi.fn<
      (url: string) => Promise<AppResult<{ data: ArrayBuffer; mimeType: string }>>
    >(async () => ok({ data: new Uint8Array([1]).buffer, mimeType: 'image/jpeg' }));
    const adapter: PlatformAdapter = {
      ...base,
      providerNetwork: { ...base.providerNetwork, isAllowedHost: () => false },
      network: { fetchBytes },
    };

    const resolved = await resolvePageObjectUrl({
      db,
      adapter,
      ...CHAPTER,
      pageIndex: 0,
      remoteUrl: 'https://evil.example/page.jpg',
    });

    expect(resolved).toBeUndefined();
    expect(fetchBytes).not.toHaveBeenCalled();
  });
  it('Given a downloaded chapter, When it is read and touched, Then the download retention stays', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    const pages = Array.from({ length: 3 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/download${pageIndex}.jpg`,
    }));

    await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages,
      retention: CACHE_RETENTION_DOWNLOAD,
    });
    await markChapterPagesAsRead(db, CHAPTER);
    await resolvePageObjectUrl({
      db,
      adapter,
      ...CHAPTER,
      pageIndex: 0,
      remoteUrl: 'https://uploads.mangadex.org/download0.jpg',
    });

    const entries = await listCacheEntriesForManga(db, CHAPTER.providerId, CHAPTER.mangaId);
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.metadata?.retention).toBe(CACHE_RETENTION_DOWNLOAD);
    }
    expect(await summarizeDownloadCache(db)).toMatchObject({
      pages: 3,
      bytes: 9,
      byChapter: [{ chapterId: CHAPTER.chapterId, pages: 3, bytes: 9 }],
    });
  });

  it('Given pages already read, When a download starts, Then they are adopted instead of fetched again', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, calls } = createPageAdapter();
    const pages = [
      { pageIndex: 0, remoteUrl: 'https://uploads.mangadex.org/a0.jpg' },
      { pageIndex: 1, remoteUrl: 'https://uploads.mangadex.org/a1.jpg' },
    ];
    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages, retention: CACHE_RETENTION_READ });
    expect(calls.fetch()).toBe(2);

    expect(await markChapterPagesDownloaded(db, CHAPTER)).toBe(2);
    expect(await markChapterPagesDownloaded(db, CHAPTER)).toBe(0);
    const outcome = await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages,
      retention: CACHE_RETENTION_DOWNLOAD,
    });

    expect(outcome).toMatchObject({ cachedPages: 2, fetchedPages: 0, failedPages: 0 });
    expect(calls.fetch()).toBe(2);
  });

  it('Given a download, When each page settles, Then progress is reported per page', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    const pages = Array.from({ length: 4 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/progress${pageIndex}.jpg`,
    }));
    const seen: { pageIndex: number; status: string }[] = [];

    await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages,
      retention: CACHE_RETENTION_DOWNLOAD,
      onPage: (page, outcome) => {
        seen.push({ pageIndex: page.pageIndex, status: outcome.status });
      },
    });

    expect(seen).toHaveLength(4);
    expect(seen.every((entry) => entry.status === 'fetched')).toBe(true);
  });

  it('Given a full disk while downloading, When a page save fails, Then the typed failure is reported and other pages are kept', async () => {
    const { db } = await createSqlJsHarness();
    const base = createPageAdapter();
    let writes = 0;
    const adapter: PlatformAdapter = {
      ...base.adapter,
      blobStorage: {
        ...base.adapter.blobStorage,
        put: async (key, data, mimeType) => {
          writes += 1;
          if (writes === 2) {
            return err(platformStorageFull('This device is out of storage.'));
          }
          return base.adapter.blobStorage.put(key, data, mimeType);
        },
      },
    };
    const pages = Array.from({ length: 4 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/disk${pageIndex}.jpg`,
    }));

    const outcome = await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages,
      retention: CACHE_RETENTION_DOWNLOAD,
    });

    expect(outcome.failures).toEqual([{ pageIndex: expect.any(Number), code: 'storage-full' }]);
    expect(outcome.failedPages).toBe(1);
    expect(outcome.fetchedPages).toBe(3);
    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toHaveLength(3);
  });

  it('Given a removed download, When its pages are removed, Then rows and blobs are gone and the bytes are reported', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    const pages = Array.from({ length: 3 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/remove${pageIndex}.jpg`,
    }));
    await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages,
      retention: CACHE_RETENTION_DOWNLOAD,
    });

    expect(await removeChapterPageEntries(db, adapter, CHAPTER)).toEqual({
      removedEntries: 3,
      removedBytes: 9,
      failedBlobKeys: [],
    });
    expect(await listCacheEntriesForManga(db, CHAPTER.providerId, CHAPTER.mangaId)).toEqual([]);
    expect(await summarizeDownloadCache(db)).toMatchObject({ pages: 0, bytes: 0 });
    expect(await removeChapterPageEntries(db, adapter, CHAPTER)).toEqual({
      removedEntries: 0,
      removedBytes: 0,
      failedBlobKeys: [],
    });
  });

  it('Given a page on web, When fetching bytes, Then the provider id reaches the adapter', async () => {
    const { db } = await createSqlJsHarness();
    const base = createPageAdapter().adapter;
    const fetchBytes = vi.fn<
      (
        url: string,
        options?: PlatformNetworkFetchOptions,
      ) => Promise<AppResult<{ data: ArrayBuffer; mimeType: string }>>
    >(async () => ok({ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/jpeg' }));
    const adapter: PlatformAdapter = { ...base, network: { fetchBytes } };

    const resolved = await resolvePageObjectUrl({
      db,
      adapter,
      ...CHAPTER,
      pageIndex: 0,
      remoteUrl: 'https://uploads.mangadex.org/page.jpg',
    });

    expect(resolved?.fromCache).toBe(false);
    expect(fetchBytes).toHaveBeenCalledWith('https://uploads.mangadex.org/page.jpg', {
      providerId: 'mangadex',
    });
  });
});
