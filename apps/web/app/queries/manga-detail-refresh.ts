import type { AppDrizzleDb } from '@app/db';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { UserFacingError, type MangaId } from '@app/shared';

import { fetchMangaDetail, libraryQueryKeys } from '@/features/library';
import { shouldRefreshMangaDetail } from '../lib/manga-detail-persist.js';
import {
  drainMangaRefreshQueue,
  enqueueMangaRefresh,
  hasMangaRefreshJob,
  logMangaRefreshFailure,
  resetMangaRefreshJob,
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
  // Held back from the queue's log: when nothing is saved locally this call is
  // the page, so its failure is rethrown and the query cache logs it once.
  const failures: unknown[] = [];
  await drainMangaRefreshQueue(
    db,
    queryClient,
    { mangaId, ...(signal === undefined ? {} : { signal }) },
    { log: (error) => failures.push(error) },
  );
  if (signal?.aborted === true) return true;

  // Cached data is on screen, so a failed refresh stays a background event.
  if (local !== null) {
    for (const error of failures) logMangaRefreshFailure(error);
    return true;
  }
  if (failures.length > 0) throw failures[0];
  // The job sat out its backoff: still nothing to show, and the user can retry.
  if (await hasMangaRefreshJob(db, mangaId)) {
    throw new UserFacingError("The source didn't respond last time. Try again.", {
      kind: 'provider-unavailable',
    });
  }
  return true;
}

/** The detail page's Retry: the job runs now whatever its backoff, then the page reads again. */
export async function retryMangaDetailRefresh(
  db: AppDrizzleDb,
  queryClient: QueryClient,
  mangaId: MangaId,
): Promise<void> {
  await resetMangaRefreshJob(db, mangaId, 'detail');
  await queryClient.refetchQueries({ queryKey: mangaDetailRefreshQueryKey(mangaId), exact: true });
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
