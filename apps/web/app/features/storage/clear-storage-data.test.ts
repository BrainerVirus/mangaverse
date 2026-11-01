// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearStorageData } from './clear-storage-data.js';
import {
  appendSearchHistory,
  listAllCacheEntries,
  summarizeCacheStorage,
  upsertCacheEntry,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import type { PlatformAdapter } from '@app/platform';
import { createAppError, err, ok } from '@app/shared';

function sortStrings(left: string | undefined, right: string | undefined): number {
  return (left ?? '').localeCompare(right ?? '');
}

function createBlobAdapter(failingKeys: readonly string[] = []) {
  const blobs = new Map<string, ArrayBuffer>();
  const failures = new Set(failingKeys);

  const adapter = {
    blobStorage: {
      put: async (key: string, data: ArrayBuffer) => {
        blobs.set(key, data);
        return ok(undefined);
      },
      get: async (key: string) => {
        const data = blobs.get(key);
        return ok(data === undefined ? undefined : { data, mimeType: 'image/png' });
      },
      delete: async (key: string) => {
        if (failures.has(key)) {
          return err(createAppError({ code: 'storage.blob_delete_failed', message: 'Nope.' }));
        }
        blobs.delete(key);
        return ok(undefined);
      },
      listKeys: async () => ok([...blobs.keys()]),
      createObjectUrl: async () => ok('blob:test'),
      revokeObjectUrl: async () => ok(undefined),
    },
  } as unknown as PlatformAdapter;

  return { adapter, blobs, failures };
}

describe('clearStorageData', () => {
  let restoreLocks: () => void;

  beforeEach(() => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          query: async () => ({ held: [], pending: [] }),
          request: async (
            _name: string,
            _options: unknown,
            callback: () => Promise<unknown>,
          ): Promise<unknown> => callback(),
        },
      },
    });
    restoreLocks = () => {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'navigator');
      else Object.defineProperty(globalThis, 'navigator', original);
    };
  });

  afterEach(() => {
    restoreLocks();
  });

  it('deletes provider cache blobs with their rows and leaves unrelated blobs alone', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, blobs } = createBlobAdapter();
    const coverKey = 'cover:prov-a:manga-1';
    const pageKey = 'page:prov-a:manga-1:chapter-1:0';
    blobs.set(coverKey, new ArrayBuffer(1));
    blobs.set(pageKey, new ArrayBuffer(1));
    blobs.set('unrelated', new ArrayBuffer(1));

    await upsertCacheEntry(db, {
      providerId: 'prov-a',
      mangaId: 'manga-1',
      cacheKind: 'cover',
      blobKey: coverKey,
    });
    await upsertCacheEntry(db, {
      providerId: 'prov-a',
      mangaId: 'manga-1',
      chapterId: 'chapter-1',
      cacheKind: 'page',
      blobKey: pageKey,
    });

    const result = await clearStorageData({ db, adapter, target: 'provider_cache' });

    expect(result).toEqual({
      target: 'provider_cache',
      clearedCount: 2,
      failedCount: 0,
      reclaimedBlobs: 0,
    });
    expect([...blobs.keys()]).toEqual(['unrelated']);
    expect(await listAllCacheEntries(db)).toEqual([]);
  });

  it('keeps the row and reports the failure when a blob delete fails, then clears it on retry', async () => {
    const { db } = await createSqlJsHarness();
    const failingKey = 'page:prov-b:manga-2:chapter-2:0';
    const { adapter, blobs, failures } = createBlobAdapter([failingKey]);
    blobs.set(failingKey, new ArrayBuffer(1));

    await upsertCacheEntry(db, {
      providerId: 'prov-b',
      mangaId: 'manga-2',
      chapterId: 'chapter-2',
      cacheKind: 'page',
      blobKey: failingKey,
    });

    const failed = await clearStorageData({ db, adapter, target: 'provider_cache' });

    expect(failed).toEqual({
      target: 'provider_cache',
      clearedCount: 0,
      failedCount: 1,
      reclaimedBlobs: 0,
    });
    expect((await listAllCacheEntries(db)).map((entry) => entry.blobKey)).toEqual([failingKey]);
    expect([...blobs.keys()]).toEqual([failingKey]);

    failures.clear();
    const retried = await clearStorageData({ db, adapter, target: 'provider_cache' });

    expect(retried).toEqual({
      target: 'provider_cache',
      clearedCount: 1,
      failedCount: 0,
      reclaimedBlobs: 0,
    });
    expect(await listAllCacheEntries(db)).toEqual([]);
    expect([...blobs.keys()]).toEqual([]);
  });

  it('reclaims row-less cache blobs as part of a clear and leaves unrelated blobs alone', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, blobs } = createBlobAdapter();
    const orphanKey = 'page:prov-a:manga-1:chapter-9:0';
    const coverKey = 'cover:prov-a:manga-1';
    blobs.set(orphanKey, new ArrayBuffer(1));
    blobs.set(coverKey, new ArrayBuffer(1));
    blobs.set('unrelated', new ArrayBuffer(1));

    await upsertCacheEntry(db, {
      providerId: 'prov-a',
      mangaId: 'manga-1',
      cacheKind: 'cover',
      blobKey: coverKey,
    });

    const result = await clearStorageData({ db, adapter, target: 'provider_cache' });

    expect(result).toEqual({
      target: 'provider_cache',
      clearedCount: 1,
      failedCount: 0,
      reclaimedBlobs: 1,
    });
    expect([...blobs.keys()]).toEqual(['unrelated']);
  });

  it('clears many entries in batches and reports each blob failure truthfully', async () => {
    const { db } = await createSqlJsHarness();
    const failingKeys = ['page:prov-c:manga-3:chapter-1:1', 'page:prov-c:manga-3:chapter-1:2'];
    const { adapter, blobs } = createBlobAdapter(failingKeys);
    const keys = Array.from(
      { length: 12 },
      (_value, index) => `page:prov-c:manga-3:chapter-1:${index}`,
    );
    for (const key of keys) {
      blobs.set(key, new ArrayBuffer(1));
    }
    await Promise.all(
      keys.map((key) =>
        upsertCacheEntry(db, {
          providerId: 'prov-c',
          mangaId: 'manga-3',
          chapterId: 'chapter-1',
          cacheKind: 'page',
          blobKey: key,
        }),
      ),
    );

    const result = await clearStorageData({ db, adapter, target: 'provider_cache' });

    expect(result).toEqual({
      target: 'provider_cache',
      clearedCount: 10,
      failedCount: 2,
      reclaimedBlobs: 0,
    });
    expect((await listAllCacheEntries(db)).map((entry) => entry.blobKey).sort(sortStrings)).toEqual(
      [...failingKeys].sort(sortStrings),
    );
    expect([...blobs.keys()].sort(sortStrings)).toEqual([...failingKeys].sort(sortStrings));
  });

  it('leaves provider cache rows and blobs alone when clearing search history', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, blobs } = createBlobAdapter();
    const coverKey = 'cover:prov-a:manga-1';
    blobs.set(coverKey, new ArrayBuffer(1));

    await upsertCacheEntry(db, {
      providerId: 'prov-a',
      mangaId: 'manga-1',
      cacheKind: 'cover',
      blobKey: coverKey,
    });
    await appendSearchHistory(db, { query: 'one piece' });

    const result = await clearStorageData({ db, adapter, target: 'search_history' });

    expect(result).toEqual({
      target: 'search_history',
      clearedCount: 1,
      failedCount: 0,
      reclaimedBlobs: 0,
    });
    expect((await summarizeCacheStorage(db)).totalCount).toBe(1);
    expect([...blobs.keys()]).toEqual([coverKey]);
  });
});
