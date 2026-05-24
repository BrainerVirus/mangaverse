// @app/cache
export const PACKAGE_NAME = '@app/cache' as const;

export {
  COVER_CACHE_KIND,
  buildCoverBlobKey,
  buildCoverCacheEntryId,
  formatCacheBytes,
  megabytesToBytes,
  bytesToMegabytes,
} from './constants.js';

export {
  getCachedCoverObjectUrl,
  storeCoverInCache,
  resolveCoverObjectUrl,
  getCoverCacheUsage,
  evictCoverCacheToLimit,
  runCoverCacheMaintenance,
  type CoverCacheLookupInput,
  type CoverCacheStoreResult,
  type CoverCacheUsageSummary,
} from './cover-cache-store.js';

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
