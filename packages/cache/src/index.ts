// @app/cache
export {
  COVER_CACHE_KIND,
  PAGE_CACHE_KIND,
  CACHE_RETENTION_READ,
  CACHE_RETENTION_NORMAL,
  buildCoverBlobKey,
  buildCoverCacheEntryId,
  buildPageBlobKey,
  buildPageCacheEntryId,
  formatCacheBytes,
  megabytesToBytes,
  bytesToMegabytes,
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
  prefetchChapterPages,
  type PageCacheLookupInput,
  type PageCacheStoreResult,
  type PrefetchQueueOutcome,
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
  CachedPageImage,
  type CachedPageImageMetric,
  type CachedPageImageProps,
} from './components/CachedPageImage.js';
