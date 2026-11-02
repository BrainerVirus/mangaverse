// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { clearStorageData } from './clear-storage-data.js';
import { fetchStorageSummary } from './fetch-storage-summary.js';
import { createSqlJsHarness } from '@app/db/testing';
import type { PlatformAdapter, PlatformCapabilities } from '@app/platform';
import { appendSearchHistory, upsertCacheEntry, upsertDownload } from '@app/db';

const adapter = {
  storage: {
    estimate: async () => ({
      ok: true as const,
      value: { quota: 1024 * 1024, usage: 512 * 1024, persisted: false },
    }),
  },
  blobStorage: {
    listKeys: async () => ({ ok: true as const, value: [] }),
  },
} as unknown as PlatformAdapter;

const webCapabilities: PlatformCapabilities = {
  runtime: 'web',
  storageEstimate: true,
  clipboardRead: false,
  clipboardWrite: false,
  nativeFileOpen: false,
  nativeFileSave: false,
  nativeFullscreen: false,
  protocolInstallHandoff: false,
  installPrompt: false,
  externalLinks: true,
  secureStorage: false,
  persistentStorage: false,
  diagnostics: false,
  localService: false,
  sqliteRuntime: false,
};

describe('storage services', () => {
  it('summarizes cache and search data with platform estimates', async () => {
    const { db } = await createSqlJsHarness();

    await upsertCacheEntry(db, {
      providerId: 'prov-a',
      mangaId: 'manga-1',
      cacheKind: 'chapter',
    });
    await upsertCacheEntry(db, {
      providerId: 'prov-a',
      mangaId: 'manga-2',
      cacheKind: 'chapter',
    });
    await upsertCacheEntry(db, {
      providerId: 'prov-b',
      mangaId: 'manga-3',
      cacheKind: 'chapter',
    });
    await appendSearchHistory(db, { query: 'one piece' });
    await appendSearchHistory(db, { query: 'naruto' });

    const summary = await fetchStorageSummary({
      db,
      adapter,
      capabilities: webCapabilities,
    });

    expect(summary.cacheEntryCount).toBe(3);
    expect(summary.cacheTotalBytes).toBe(0);
    expect(summary.cacheByProvider).toEqual([
      { providerId: 'prov-a', count: 2, bytes: 0 },
      { providerId: 'prov-b', count: 1, bytes: 0 },
    ]);
    expect(summary.searchHistoryCount).toBe(2);
    expect(summary.platformEstimate?.usage).toBe(512 * 1024);
  });

  it('clears provider cache metadata and search history safely', async () => {
    const { db } = await createSqlJsHarness();

    await upsertCacheEntry(db, {
      providerId: 'prov-a',
      mangaId: 'manga-1',
      cacheKind: 'chapter',
    });
    await appendSearchHistory(db, { query: 'bleach' });

    const cacheResult = await clearStorageData({ db, adapter, target: 'provider_cache' });
    expect(cacheResult).toEqual({
      target: 'provider_cache',
      clearedCount: 1,
      failedCount: 0,
      reclaimedBlobs: 0,
    });

    const historyResult = await clearStorageData({ db, adapter, target: 'search_history' });
    expect(historyResult).toEqual({
      target: 'search_history',
      clearedCount: 1,
      failedCount: 0,
      reclaimedBlobs: 0,
    });

    const summary = await fetchStorageSummary({
      db,
      adapter,
      capabilities: { ...webCapabilities, storageEstimate: false },
    });

    expect(summary.cacheEntryCount).toBe(0);
    expect(summary.searchHistoryCount).toBe(0);
  });
  it('reports download bytes separately and keeps downloads when clearing provider cache', async () => {
    const { db } = await createSqlJsHarness();

    await upsertCacheEntry(db, {
      id: 'page:prov-a:manga-1:chapter-1:0',
      providerId: 'prov-a',
      mangaId: 'manga-1',
      chapterId: 'chapter-1',
      cacheKind: 'page',
      byteSize: 7,
      metadata: { pageIndex: 0, retention: 'download' },
    });
    await upsertCacheEntry(db, {
      id: 'page:prov-a:manga-1:chapter-2:0',
      providerId: 'prov-a',
      mangaId: 'manga-1',
      chapterId: 'chapter-2',
      cacheKind: 'page',
      byteSize: 3,
      metadata: { pageIndex: 0, retention: 'normal' },
    });
    await upsertDownload(db, {
      chapterId: 'chapter-1',
      mangaId: 'manga-1',
      providerId: 'prov-a',
      status: 'complete',
      pageCount: 1,
      completedPages: 1,
    });

    const summary = await fetchStorageSummary({ db, adapter, capabilities: webCapabilities });
    expect(summary.cacheTotalBytes).toBe(10);
    expect(summary.cacheEvictableBytes).toBe(3);
    expect(summary.downloads).toMatchObject({
      count: 1,
      pageCount: 1,
      bytes: 7,
      items: [{ chapterId: 'chapter-1', status: 'complete', bytes: 7, title: 'chapter-1' }],
    });

    const cleared = await clearStorageData({ db, adapter, target: 'provider_cache' });
    expect(cleared.clearedCount).toBe(1);

    const after = await fetchStorageSummary({ db, adapter, capabilities: webCapabilities });
    expect(after.cacheTotalBytes).toBe(7);
    expect(after.downloads.count).toBe(1);
    expect(after.cacheEvictableBytes).toBe(0);
  });
});
