import type { AppDrizzleDb } from '@app/db';
import type { PlatformAdapter, PlatformCapabilities } from '@app/platform';

import type { StorageSummary } from './types.js';

export interface FetchStorageSummaryInput {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly capabilities: PlatformCapabilities;
}

export async function fetchStorageSummary(input: FetchStorageSummaryInput): Promise<StorageSummary> {
  const { db, adapter, capabilities } = input;
  const { countSavedSearches, countSearchHistory, summarizeCacheStorage } = await import('@app/db');

  const [cacheSummary, searchHistoryCount, savedSearchCount, storageResult] = await Promise.all([
    summarizeCacheStorage(db),
    countSearchHistory(db),
    countSavedSearches(db),
    capabilities.storageEstimate ? adapter.storage.estimate() : Promise.resolve(null),
  ]);

  const platformEstimate =
    storageResult !== null && storageResult.ok ? storageResult.value : null;

  return {
    generatedAt: new Date().toISOString(),
    platformEstimate,
    cacheEntryCount: cacheSummary.totalCount,
    cacheTotalBytes: cacheSummary.totalBytes,
    cacheByProvider: cacheSummary.byProvider,
    searchHistoryCount,
    savedSearchCount,
  };
}
