// @app/cache
export {
  COVER_CACHE_KIND,
  PAGE_CACHE_KIND,
  CACHE_RETENTION_READ,
  CACHE_RETENTION_NORMAL,
  CACHE_RETENTION_DOWNLOAD,
  buildCoverBlobKey,
  buildCoverCacheEntryId,
  buildPageBlobKey,
  buildPageCacheEntryId,
  formatCacheBytes,
  megabytesToBytes,
  bytesToMegabytes,
  type CacheRetention,
} from './constants.js';

export {
  getCachedCoverObjectUrl,
  storeCoverInCache,
  resolveCoverObjectUrl,
  resolveCoverUrl,
  getCoverCacheUsage,
  type CoverCacheLookupInput,
  type CoverCacheStoreResult,
  type CoverCacheUsageSummary,
} from './cover-cache-store.js';

export { evictCacheToLimit, runCacheMaintenance } from './cache-maintenance.js';
export { deleteBlobKeys } from './blob-deletes.js';
export { reclaimOrphanBlobs } from './orphan-blobs.js';
export { holdReaderLocks } from './reader-locks.js';

export {
  getCachedPageObjectUrl,
  storePageInCache,
  resolvePageObjectUrl,
  resolvePageUrl,
  listCachedChapterPageIndexes,
  markChapterPagesAsRead,
  markChapterPagesDownloaded,
  prefetchChapterPages,
  removeChapterPageEntries,
  summarizeDownloadCache,
  type PageCacheLookupInput,
  type PageCacheStoreResult,
  type PageCacheFailure,
  type PageCacheFailureCode,
  type PrefetchPage,
  type PrefetchPageOutcome,
  type PrefetchQueueOutcome,
  type DownloadCacheUsage,
  type RemoveChapterCacheOutcome,
} from './page-cache-store.js';

export {
  CoverCacheProvider,
  useCoverCacheContext,
  type CoverCacheProviderProps,
  type CoverCacheContextValue,
} from './components/CoverCacheProvider.js';

export {
  CachedCoverImage,
  CachedMangaCardCover,
  getDefaultProviderId,
  type CachedCoverImageProps,
  type CachedMangaCardCoverProps,
} from './components/CachedCoverImage.js';

export { CachedMangaCard } from './components/CachedMangaCard.js';

export {
  createPageDecodePool,
  type DecodedPage,
  type PageDecodePlanItem,
  type PageDecodePool,
  type PageDecodePoolInput,
  type PageDecodePoolSnapshot,
} from './page-decode-pool.js';

export {
  acquirePageObjectUrl,
  pageObjectUrlKey,
  releasePageObjectUrl,
  type AcquirePageObjectUrlOptions,
  type PageObjectUrlInput,
} from './page-object-url-registry.js';

export {
  CachedPageImage,
  type CachedPageImageMetric,
  type CachedPageImageProps,
} from './components/CachedPageImage.js';
