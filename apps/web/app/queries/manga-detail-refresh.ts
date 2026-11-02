import type { AppDrizzleDb } from '@app/db';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { MangaId } from '@app/shared';

import { fetchMangaDetail, libraryQueryKeys } from '@/features/library';
import { shouldRefreshMangaDetail } from '../lib/manga-detail-persist.js';
import {
  drainMangaRefreshQueue,
  enqueueMangaRefresh,
  hasMangaRefreshJob,
} from '../lib/manga-refresh-queue.js';
import { getBindingForMangaId } from '../lib/provider-registry.js';

/**
 * Kept outside `libraryQueryKeys.all`: the queue's own invalidation must never
 * refetch this query and feed a fresh provider call straight back into itself.
 */
function mangaDetailRefreshQueryKey(mangaId: MangaId): readonly unknown[] {
  return ['manga-detail-refresh', mangaId];
}

/** A registered provider binding is the only case where a refresh can do work. */
export function canRefreshMangaDetail(mangaId: MangaId): boolean {
  return getBindingForMangaId(mangaId) !== null;
}

/**
 * The local half of the split. Its query function only reads SQLite, so the
 * detail surface can render while a provider call is still pending or absent.
 */
export function localMangaDetailQueryOptions(db: AppDrizzleDb, mangaId: MangaId) {
  return queryOptions({
    queryKey: libraryQueryKeys.detail(mangaId),
    queryFn: () => fetchMangaDetail(db, mangaId),
  });
}

/**
 * The background half of the local-first split: the surface reads SQLite, and
 * this query only persists provider data and writes it into the detail cache.
 * A cached title whose chapter list is already local needs no provider call.
 */
export async function refreshMangaDetailForRoute(
  db: AppDrizzleDb,
  queryClient: QueryClient,
  mangaId: MangaId,
  signal?: AbortSignal,
): Promise<boolean> {
  const [local, queued] = await Promise.all([
    fetchMangaDetail(db, mangaId),
    hasMangaRefreshJob(db, mangaId),
  ]);
  if (!queued && !shouldRefreshMangaDetail(local)) return false;

  if (!queued) await enqueueMangaRefresh(db, mangaId, 'detail');
  await drainMangaRefreshQueue(db, queryClient, {
    mangaId,
    ...(signal === undefined ? {} : { signal }),
  });
  return true;
}

export function mangaDetailRefreshQueryOptions(
  db: AppDrizzleDb,
  queryClient: QueryClient,
  mangaId: MangaId,
) {
  return queryOptions({
    queryKey: mangaDetailRefreshQueryKey(mangaId),
    queryFn: ({ signal }) => refreshMangaDetailForRoute(db, queryClient, mangaId, signal),
    // The queue owns retries and backoff; a query-level retry would double-call.
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    meta: { feedback: { surface: 'silent' } },
  });
}
