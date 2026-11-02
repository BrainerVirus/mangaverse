import type { DownloadStatus } from '@app/db';
import type { PlatformStorageEstimate } from '@app/platform';

export interface StorageDownloadItem {
  readonly chapterId: string;
  readonly mangaId: string;
  readonly providerId: string;
  readonly status: DownloadStatus;
  readonly pageCount: number;
  readonly completedPages: number;
  readonly failedPages: number;
  readonly bytes: number;
  readonly title: string;
  readonly chapterIndex?: number;
  readonly mangaTitle?: string;
}

export interface StorageSummary {
  readonly generatedAt: string;
  readonly platformEstimate: PlatformStorageEstimate | null;
  readonly cacheEntryCount: number;
  /** Every cached byte, downloads included. */
  readonly cacheTotalBytes: number;
  /** Cached bytes eviction may reclaim; downloads are excluded. */
  readonly cacheEvictableBytes: number;
  readonly cacheByProvider: readonly {
    readonly providerId: string;
    readonly count: number;
    readonly bytes: number;
  }[];
  readonly downloads: {
    /** Explicit downloads, one row per chapter. */
    readonly count: number;
    /** Pages held for downloads; the same bytes as their cache rows. */
    readonly pageCount: number;
    readonly bytes: number;
    readonly items: readonly StorageDownloadItem[];
  };
  readonly searchHistoryCount: number;
  readonly savedSearchCount: number;
}

export type StorageClearTarget = 'provider_cache' | 'search_history';

export interface ClearStorageResult {
  readonly target: StorageClearTarget;
  readonly clearedCount: number;
  /** Entries kept because their blob could not be deleted; a retry clears them. */
  readonly failedCount: number;
  /** Row-less cache blobs an earlier failed delete left behind and this clear reclaimed. */
  readonly reclaimedBlobs: number;
}
