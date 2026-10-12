import { describe, expect, it } from 'vitest';

import { clearStorageData } from './clear-storage-data.js';
import { fetchStorageSummary } from './fetch-storage-summary.js';
import { createSqlJsHarness } from '@app/db/testing';
import {
  appendSearchHistory,
  upsertCacheEntry,
} from '@app/db';

const adapter = {
  storage: {
    estimate: async () => ({
      ok: true as const,
      value: { quota: 1024 * 1024, usage: 512 * 1024, persisted: false },
    }),
  },
} as const;

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
      capabilities: {
        runtime: 'web',
        storageEstimate: true,
        clipboardRead: false,
        clipboardWrite: false,
        fileImport: false,
        fileExport: false,
        fullscreen: false,
        customProtocol: false,
        installPrompt: false,
        externalLinks: true,
        secureStorage: false,
        diagnostics: false,
        localService: false,
      },
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

    const cacheResult = await clearStorageData(db, 'provider_cache');
    expect(cacheResult).toEqual({ target: 'provider_cache', clearedCount: 1 });

    const historyResult = await clearStorageData(db, 'search_history');
    expect(historyResult).toEqual({ target: 'search_history', clearedCount: 1 });

    const summary = await fetchStorageSummary({
      db,
      adapter,
      capabilities: {
        runtime: 'web',
        storageEstimate: false,
        clipboardRead: false,
        clipboardWrite: false,
        fileImport: false,
        fileExport: false,
        fullscreen: false,
        customProtocol: false,
        installPrompt: false,
        externalLinks: true,
        secureStorage: false,
        diagnostics: false,
        localService: false,
      },
    });

    expect(summary.cacheEntryCount).toBe(0);
    expect(summary.searchHistoryCount).toBe(0);
  });
});
