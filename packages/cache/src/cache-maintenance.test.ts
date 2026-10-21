import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok, type AppResult } from '@app/shared';
import type { PlatformAdapter } from '@app/platform';
import type { AppDrizzleDb } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';

import {
  createCacheMaintenanceScheduler,
  evictCacheToLimit,
  runCacheMaintenance,
} from './cache-maintenance.js';
import { getCoverCacheUsage, storeCoverInCache } from './cover-cache-store.js';
import { buildCoverBlobKey, buildPageBlobKey } from './constants.js';
import {
  getCachedPageObjectUrl,
  listCachedChapterPageIndexes,
  storePageInCache,
} from './page-cache-store.js';

import type * as OpenChaptersModule from './open-chapters.js';

const openChapterState = vi.hoisted(() => ({
  open: [] as { providerId: string; mangaId: string; chapterId: string }[],
}));

vi.mock('./open-chapters.js', async (importOriginal) => {
  const actual = await importOriginal<typeof OpenChaptersModule>();
  return { ...actual, listOpenChapters: async () => openChapterState.open };
});

const CHAPTER_1 = { providerId: 'mangadex', mangaId: 'dev-md-abc', chapterId: 'chapter-1' };
const CHAPTER_2 = { providerId: 'mangadex', mangaId: 'dev-md-abc', chapterId: 'chapter-2' };
const PAGE_BYTES = 10;

function createAdapter(
  failDelete: (key: string) => boolean = () => false,
  overrides: { readonly listKeys?: () => Promise<AppResult<readonly string[]>> } = {},
): {
  adapter: PlatformAdapter;
  blobs: Map<string, ArrayBuffer>;
} {
  const blobs = new Map<string, ArrayBuffer>();

  return {
    blobs,
    adapter: {
      blobStorage: {
        put: async (key: string, data: ArrayBuffer) => {
          blobs.set(key, data);
          return ok(undefined);
        },
        get: async (key: string) => {
          const data = blobs.get(key);
          return ok(data === undefined ? undefined : { data, mimeType: 'image/jpeg' });
        },
        delete: async (key: string) => {
          if (failDelete(key)) return err({ code: 'blob.delete_failed', message: 'delete failed' });
          blobs.delete(key);
          return ok(undefined);
        },
        listKeys: overrides.listKeys ?? (async () => ok([...blobs.keys()])),
        createObjectUrl: async () => ok('blob:mock'),
        revokeObjectUrl: async () => ok(undefined),
      },
    } as unknown as PlatformAdapter,
  };
}

async function seedChapter(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  chapter: typeof CHAPTER_1,
  pageCount = 6,
): Promise<void> {
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    await storePageInCache({
      db,
      adapter,
      ...chapter,
      pageIndex,
      remoteUrl: `https://example.com/${chapter.chapterId}/${pageIndex}.jpg`,
      data: new Uint8Array(PAGE_BYTES).buffer,
      mimeType: 'image/jpeg',
    });
  }
}

async function seedCover(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  mangaId: string,
): Promise<void> {
  await storeCoverInCache({
    db,
    adapter,
    providerId: 'mangadex',
    mangaId,
    remoteUrl: `https://example.com/${mangaId}.jpg`,
    data: new Uint8Array(100).buffer,
    mimeType: 'image/jpeg',
  });
}

describe('cache maintenance', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Given pages over the limit, When sweeping, Then the oldest whole chapter is evicted', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, blobs } = createAdapter();

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await seedChapter(db, adapter, CHAPTER_1);
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    await seedCover(db, adapter, 'dev-md-abc');
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    await seedChapter(db, adapter, CHAPTER_2);

    const eviction = await evictCacheToLimit(db, adapter, { limitBytes: 200 });

    expect(eviction.evictedCount).toBe(6);
    expect(eviction.failedBlobKeys).toEqual([]);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([]);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_2)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(blobs.has(buildPageBlobKey('mangadex', 'dev-md-abc', 'chapter-1', 0))).toBe(false);
    expect(blobs.has(buildPageBlobKey('mangadex', 'dev-md-abc', 'chapter-2', 0))).toBe(true);
    expect(blobs.has(buildCoverBlobKey('mangadex', 'dev-md-abc'))).toBe(true);
    expect((await getCoverCacheUsage(db)).totalBytes).toBe(160);
  });

  it('Given the protected chapter is the only candidate, When sweeping, Then it stays cached and may overshoot', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, blobs } = createAdapter();

    await seedChapter(db, adapter, CHAPTER_1, 40);

    const eviction = await evictCacheToLimit(db, adapter, {
      limitBytes: 200,
      protectChapter: CHAPTER_1,
    });

    expect(eviction.evictedCount).toBe(0);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toHaveLength(40);
    expect(blobs.size).toBe(40);
    // Explicit overshoot: 400 bytes cached against a 200-byte limit.
    expect((await getCoverCacheUsage(db)).totalBytes).toBe(400);
  });

  it('Given pages marked read, When sweeping, Then retention does not pin them', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createAdapter();

    for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
      await storePageInCache({
        db,
        adapter,
        ...CHAPTER_1,
        pageIndex,
        remoteUrl: `https://example.com/${pageIndex}.jpg`,
        data: new Uint8Array(50).buffer,
        mimeType: 'image/jpeg',
        retention: 'read',
      });
    }

    const eviction = await evictCacheToLimit(db, adapter, { limitBytes: 100 });

    expect(eviction.evictedCount).toBe(4);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([]);
  });

  it('Given a failing cover blob delete, When sweeping, Then the row is still freed and the sweep stops at the cap', async () => {
    const { db } = await createSqlJsHarness();
    const failedKey = buildCoverBlobKey('mangadex', 'dev-md-abc');
    const { adapter, blobs } = createAdapter((key) => key === failedKey);

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await seedCover(db, adapter, 'dev-md-abc');
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    await seedChapter(db, adapter, CHAPTER_1);

    const eviction = await evictCacheToLimit(db, adapter, { limitBytes: 100 });

    expect(eviction.evictedCount).toBe(1);
    expect(eviction.failedBlobKeys).toEqual([failedKey]);
    // The cover's orphan blob stays, but its row is gone so nothing claims it.
    expect(blobs.has(failedKey)).toBe(true);
    // Only the chapter's six pages remain in row-based accounting.
    expect((await getCoverCacheUsage(db)).totalBytes).toBe(60);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('Given one page blob delete failing, When sweeping, Then rows go first and only the blob is orphaned', async () => {
    const { db } = await createSqlJsHarness();
    const failedKey = buildPageBlobKey('mangadex', 'dev-md-abc', 'chapter-1', 2);
    const { adapter, blobs } = createAdapter((key) => key === failedKey);

    await seedChapter(db, adapter, CHAPTER_1);

    const eviction = await evictCacheToLimit(db, adapter, { limitBytes: 50 });

    expect(eviction.evictedCount).toBe(6);
    expect(eviction.failedBlobKeys).toEqual([failedKey]);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([]);
    for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
      const key = buildPageBlobKey('mangadex', 'dev-md-abc', 'chapter-1', pageIndex);
      expect(blobs.has(key)).toBe(pageIndex === 2);
    }
    expect(
      await getCachedPageObjectUrl({
        db,
        adapter,
        ...CHAPTER_1,
        pageIndex: 0,
        remoteUrl: 'https://example.com/chapter-1/0.jpg',
      }),
    ).toBeUndefined();
    // The whole candidate counts as freed, so row-based usage meets the cap.
    expect((await getCoverCacheUsage(db)).totalBytes).toBe(0);
  });

  it('Given an older cover and a newer chapter, When sweeping, Then the cover goes first and the chapter stays whole', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, blobs } = createAdapter();

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await seedCover(db, adapter, 'dev-md-abc');
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    await seedChapter(db, adapter, CHAPTER_1);

    const eviction = await evictCacheToLimit(db, adapter, { limitBytes: 100 });

    expect(eviction.evictedCount).toBe(1);
    expect(blobs.has(buildCoverBlobKey('mangadex', 'dev-md-abc'))).toBe(false);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([0, 1, 2, 3, 4, 5]);
    expect((await getCoverCacheUsage(db)).totalBytes).toBe(60);
  });

  it('Given a protected chapter older than the rest, When sweeping, Then newer chapters are still evicted', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createAdapter();

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await seedChapter(db, adapter, CHAPTER_1);
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    await seedChapter(db, adapter, CHAPTER_2);

    const eviction = await evictCacheToLimit(db, adapter, {
      limitBytes: 60,
      protectChapter: CHAPTER_1,
    });

    expect(eviction.evictedCount).toBe(6);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_2)).toEqual([]);
  });

  it('Given storage under the limit, When maintaining, Then nothing is evicted', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createAdapter();

    await seedChapter(db, adapter, CHAPTER_1);

    expect(await runCacheMaintenance(db, adapter, 1000)).toEqual({
      evictedCount: 0,
      totalBytes: 60,
      failedBlobDeletes: 0,
      reclaimedBlobs: 0,
    });
  });

  it('Given a runtime without an enumerable blob store, When maintaining, Then the sweep is a no-op', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createAdapter(() => false, {
      listKeys: async () => err({ code: 'platform.unsupported', message: 'no blob keys' }),
    });

    await seedCover(db, adapter, 'dev-md-abc');

    expect(await runCacheMaintenance(db, adapter, 1000)).toEqual({
      evictedCount: 0,
      totalBytes: 100,
      failedBlobDeletes: 0,
      reclaimedBlobs: 0,
    });
  });

  it('Given a blob left row-less by a failed delete, When maintenance runs, Then it is reclaimed', async () => {
    const { db } = await createSqlJsHarness();
    const failedKey = buildCoverBlobKey('mangadex', 'dev-md-abc');
    let failDelete = true;
    const { adapter, blobs } = createAdapter((key) => failDelete && key === failedKey);

    await seedCover(db, adapter, 'dev-md-abc');
    await evictCacheToLimit(db, adapter, { limitBytes: 0 });
    expect(blobs.has(failedKey)).toBe(true);

    failDelete = false;
    const outcome = await runCacheMaintenance(db, adapter, 1000);

    // The cover row is gone, so the blob is an orphan only enumeration can find.
    expect(outcome.reclaimedBlobs).toBe(1);
    expect(outcome.failedBlobDeletes).toBe(0);
    expect(blobs.has(failedKey)).toBe(false);
  });

  it('Given a persistent orphan delete failure, When maintenance runs, Then the failure is reported and retried later', async () => {
    const { db } = await createSqlJsHarness();
    const failedKey = buildCoverBlobKey('mangadex', 'dev-md-abc');
    const { adapter, blobs } = createAdapter((key) => key === failedKey);

    await seedCover(db, adapter, 'dev-md-abc');
    await evictCacheToLimit(db, adapter, { limitBytes: 0 });

    // Eviction reports the first failure; the sweep retries it in the same pass.
    const outcome = await runCacheMaintenance(db, adapter, 1000);

    expect(outcome.reclaimedBlobs).toBe(0);
    expect(outcome.failedBlobDeletes).toBe(1);
    expect(blobs.has(failedKey)).toBe(true);
  });

  it('Given unrelated blobs and more orphans than one pass may delete, When maintenance runs, Then only cache keys are reclaimed and the pass is bounded', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, blobs } = createAdapter();
    blobs.set('unrelated-download', new ArrayBuffer(1));
    for (let index = 0; index < 201; index += 1) {
      blobs.set(
        buildPageBlobKey('mangadex', 'orphan-manga', 'chapter-x', index),
        new ArrayBuffer(1),
      );
    }

    const first = await runCacheMaintenance(db, adapter, 1000);

    // One pass reclaims at most 200; the remainder is retried next pass.
    expect(first.reclaimedBlobs).toBe(200);
    expect(blobs.has('unrelated-download')).toBe(true);
    expect(blobs.size).toBe(2);

    const second = await runCacheMaintenance(db, adapter, 1000);

    expect(second.reclaimedBlobs).toBe(1);
    expect(blobs.has('unrelated-download')).toBe(true);
    expect(blobs.size).toBe(1);
  });

  it('Given another tab reports a chapter open, When sweeping, Then that chapter is not evicted', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createAdapter();
    // The registry's BroadcastChannel path is covered by open-chapters.test.ts;
    // here the sweep only needs to honor what it reports.
    openChapterState.open = [CHAPTER_1];

    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      await seedChapter(db, adapter, CHAPTER_1);
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
      await seedChapter(db, adapter, CHAPTER_2);

      const eviction = await evictCacheToLimit(db, adapter, { limitBytes: 60 });

      expect(eviction.evictedCount).toBe(6);
      expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(await listCachedChapterPageIndexes(db, CHAPTER_2)).toEqual([]);
    } finally {
      openChapterState.open = [];
    }
  });
});

describe('cache maintenance scheduler', () => {
  it('Given 24 cold covers, When each requests maintenance, Then only one scan runs', async () => {
    vi.useFakeTimers();
    try {
      const runs: { db: unknown; adapter: unknown; limitBytes: number }[] = [];
      const scheduler = createCacheMaintenanceScheduler(async (input) => {
        runs.push(input);
      }, 250);
      const adapter = {} as PlatformAdapter;
      const db = {} as AppDrizzleDb;

      for (let i = 0; i < 24; i++) scheduler.request({ db, adapter, limitBytes: 1000 + i });
      expect(runs).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(249);
      expect(runs).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(runs).toHaveLength(1);
      // The latest limit wins: a settings change before the run must apply.
      expect(runs[0]?.limitBytes).toBe(1023);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Given a request during a run, When it finishes, Then one trailing scan runs and they never overlap', async () => {
    vi.useFakeTimers();
    try {
      let running = 0;
      let peak = 0;
      let runs = 0;
      let release!: () => void;
      const scheduler = createCacheMaintenanceScheduler(async () => {
        runs += 1;
        running += 1;
        peak = Math.max(peak, running);
        if (runs === 1) await new Promise<void>((resolve) => (release = resolve));
        running -= 1;
      }, 250);
      const adapter = {} as PlatformAdapter;
      const db = {} as AppDrizzleDb;

      scheduler.request({ db, adapter, limitBytes: 1 });
      await vi.advanceTimersByTimeAsync(250);
      expect(runs).toBe(1);

      scheduler.request({ db, adapter, limitBytes: 2 });
      await vi.advanceTimersByTimeAsync(250);
      expect(runs).toBe(1);

      release();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(250);
      expect(runs).toBe(2);
      expect(peak).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
