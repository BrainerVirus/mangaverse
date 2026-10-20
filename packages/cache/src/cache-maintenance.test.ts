import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '@app/shared';
import type { PlatformAdapter } from '@app/platform';
import type { AppDrizzleDb } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';

import { evictCacheToLimit, runCacheMaintenance } from './cache-maintenance.js';
import { getCoverCacheUsage } from './cover-cache-store.js';
import { buildCoverBlobKey, buildPageBlobKey } from './constants.js';
import { listCachedChapterPageIndexes, storePageInCache } from './page-cache-store.js';
import { storeCoverInCache } from './cover-cache-store.js';

const CHAPTER_1 = { providerId: 'mangadex', mangaId: 'dev-md-abc', chapterId: 'chapter-1' };
const CHAPTER_2 = { providerId: 'mangadex', mangaId: 'dev-md-abc', chapterId: 'chapter-2' };
const PAGE_BYTES = 10;

function createAdapter(failDelete: (key: string) => boolean = () => false): {
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

    const evicted = await evictCacheToLimit(db, adapter, { limitBytes: 200 });

    expect(evicted).toBe(6);
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

    const evicted = await evictCacheToLimit(db, adapter, {
      limitBytes: 200,
      protectChapter: CHAPTER_1,
    });

    expect(evicted).toBe(0);
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

    const evicted = await evictCacheToLimit(db, adapter, { limitBytes: 100 });

    expect(evicted).toBe(4);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([]);
  });

  it('Given a failing blob delete, When sweeping, Then the row is kept and other candidates are still evicted', async () => {
    const { db } = await createSqlJsHarness();
    const failedKey = buildCoverBlobKey('mangadex', 'dev-md-abc');
    const { adapter, blobs } = createAdapter((key) => key === failedKey);

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await seedCover(db, adapter, 'dev-md-abc');
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    await seedChapter(db, adapter, CHAPTER_1);

    const evicted = await evictCacheToLimit(db, adapter, { limitBytes: 100 });

    expect(evicted).toBe(6);
    expect(blobs.has(failedKey)).toBe(true);
    expect((await getCoverCacheUsage(db)).totalCount).toBe(1);
    expect(await listCachedChapterPageIndexes(db, CHAPTER_1)).toEqual([]);
  });

  it('Given storage under the limit, When maintaining, Then nothing is evicted', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createAdapter();

    await seedChapter(db, adapter, CHAPTER_1);

    expect(await runCacheMaintenance(db, adapter, 1000)).toEqual({
      evictedCount: 0,
      totalBytes: 60,
    });
  });
});
