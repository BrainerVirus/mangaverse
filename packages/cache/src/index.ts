// @app/cache
export const PACKAGE_NAME = '@app/cache' as const;

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
  evictCoverCacheToLimit,
  runCoverCacheMaintenance,
  type CoverCacheLookupInput,
  type CoverCacheStoreResult,
  type CoverCacheUsageSummary,
} from './cover-cache-store.js';

export {
  getCachedPageObjectUrl,
  storePageInCache,
  resolvePageObjectUrl,
  resolvePageUrl,
  markChapterPagesAsRead,
  prefetchChapterPages,
  type PageCacheLookupInput,
  type PageCacheStoreResult,
} from './page-cache-store.js';

export {
  prefetchMangaCover,
  scheduleMangaCoverPrefetch,
  cancelMangaCoverPrefetch,
} from './prefetch-manga.js';

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
  type CachedPageImageProps,
} from './components/CachedPageImage.js';
