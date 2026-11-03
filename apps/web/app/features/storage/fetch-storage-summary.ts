import type { AppDrizzleDb } from '@app/db';
import { summarizeDownloadCache } from '@app/cache';
import type { PlatformAdapter, PlatformCapabilities } from '@app/platform';

import type { StorageDownloadItem, StorageSummary } from './types.js';

export interface FetchStorageSummaryInput {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly capabilities: PlatformCapabilities;
}

export async function fetchStorageSummary(
  input: FetchStorageSummaryInput,
): Promise<StorageSummary> {
  const { db, adapter, capabilities } = input;
  const { countSavedSearches, countSearchHistory, listDownloadDetails, summarizeCacheStorage } =
    await import('@app/db');

  const [
    cacheSummary,
    downloadUsage,
    downloadRows,
    searchHistoryCount,
    savedSearchCount,
    storageResult,
  ] = await Promise.all([
    summarizeCacheStorage(db),
    summarizeDownloadCache(db),
    listDownloadDetails(db),
    countSearchHistory(db),
    countSavedSearches(db),
    capabilities.storageEstimate ? adapter.storage.estimate() : Promise.resolve(null),
  ]);

  const platformEstimate = storageResult !== null && storageResult.ok ? storageResult.value : null;
  const usageByChapter = new Map(
    downloadUsage.byChapter.map((chapter) => [chapter.chapterId, chapter]),
  );
  const items: StorageDownloadItem[] = downloadRows.map((row) => {
    const usage = usageByChapter.get(row.chapterId);
    return {
      chapterId: row.chapterId,
      mangaId: row.mangaId,
      providerId: row.providerId,
      status: row.status,
      pageCount: row.pageCount,
      completedPages: row.completedPages,
      failedPages: row.failedPageIndexes.length,
      bytes: usage?.bytes ?? 0,
      title: row.chapterTitle ?? row.chapterId,
      ...(row.chapterIndex === undefined ? {} : { chapterIndex: row.chapterIndex }),
      ...(row.mangaTitle === undefined ? {} : { mangaTitle: row.mangaTitle }),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    platformEstimate,
    cacheEntryCount: cacheSummary.totalCount,
    cacheTotalBytes: cacheSummary.totalBytes,
    cacheEvictableBytes: Math.max(0, cacheSummary.totalBytes - downloadUsage.bytes),
    cacheByProvider: cacheSummary.byProvider,
    downloads: {
      count: downloadRows.length,
      pageCount: downloadUsage.pages,
      bytes: downloadUsage.bytes,
      items,
    },
    searchHistoryCount,
    savedSearchCount,
  };
}
