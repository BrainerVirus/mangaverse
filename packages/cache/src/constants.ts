export const COVER_CACHE_KIND = 'cover' as const;
export const PAGE_CACHE_KIND = 'page' as const;

export const CACHE_RETENTION_READ = 'read' as const;
export const CACHE_RETENTION_NORMAL = 'normal' as const;

export function buildCoverBlobKey(providerId: string, mangaId: string): string {
  return `cover:${providerId}:${mangaId}`;
}

export function buildCoverCacheEntryId(providerId: string, mangaId: string): string {
  return buildCoverBlobKey(providerId, mangaId);
}

export function buildPageBlobKey(
  providerId: string,
  mangaId: string,
  chapterId: string,
  pageIndex: number,
): string {
  return `page:${providerId}:${mangaId}:${chapterId}:${pageIndex}`;
}

export function buildPageCacheEntryId(
  providerId: string,
  mangaId: string,
  chapterId: string,
  pageIndex: number,
): string {
  return buildPageBlobKey(providerId, mangaId, chapterId, pageIndex);
}

export function formatCacheBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function megabytesToBytes(megabytes: number): number {
  return Math.round(megabytes * 1024 * 1024);
}

export function bytesToMegabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}
