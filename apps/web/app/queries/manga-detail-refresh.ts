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
import { ROUTE_DATA_HANDOFF_GC_MS, warmRouteQuery } from '../lib/route-data.js';

/**
 * Kept outside `libraryQueryKeys.all`: the queue's own invalidation must never
 * refetch this query and feed a fresh provider call straight back into itself.
 */
function mangaDetailRefreshQueryKey(mangaId: MangaId): readonly unknown[] {
  return ['manga-detail-refresh', mangaId];
}

/** A function, not an inline check: the signal can change across the awaits between checks. */
function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
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
    // A failed read the route loader met is the page's to show, with Retry; not read twice.
    retryOnMount: false,
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
  // Cancelled before any durable work (an abandoned navigation): the queue is left as it was.
  if (isCancelled(signal)) return false;

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
    // The queue owns retries and backoff; a query-level retry would double-call, and so would a
    // rerun on mount of a failure the route loader already met.
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
    // Long enough for the page to take over what its route loader warmed, a failure included;
    // `warmMangaDetail` forgets the leftover on the next visit, so every visit checks again.
    gcTime: ROUTE_DATA_HANDOFF_GC_MS,
    meta: { feedback: { surface: 'silent' } },
  });
}

/** A settled refresh no page shows is an earlier visit's answer; this visit must check again. */
function forgetEarlierRefresh(queryClient: QueryClient, mangaId: MangaId): void {
  queryClient.removeQueries({
    queryKey: mangaDetailRefreshQueryKey(mangaId),
    exact: true,
    predicate: (query) => query.getObserversCount() === 0 && query.state.fetchStatus === 'idle',
  });
}

/**
 * The route loader's half of the detail page. Local-first: the SQLite read decides, and a title
 * with anything saved opens at once while the page refreshes it beside the surface. A hover
 * (`preload`) only reads locally: the source refresh enqueues durable work, which waits for a
 * real navigation. Only a title with nothing saved then waits on its source, through the same
 * refresh query the page reads, so the page picks up the request in flight. An abandoned loader
 * (`signal`) starts nothing new and cancels the refresh while no page shows it. Each visit
 * first forgets an earlier visit's settled refresh, so a reopened title is checked again.
 */
export async function warmMangaDetail(
  queryClient: QueryClient,
  db: AppDrizzleDb,
  mangaId: MangaId,
  { signal, preload = false }: { readonly signal?: AbortSignal; readonly preload?: boolean } = {},
): Promise<void> {
  if (!preload) forgetEarlierRefresh(queryClient, mangaId);
  const local = await warmRouteQuery(
    queryClient,
    localMangaDetailQueryOptions(db, mangaId),
    signal,
  );
  if (preload || local !== null || !canRefreshMangaDetail(mangaId)) return;
  if (signal?.aborted === true) return;
  await warmRouteQuery(
    queryClient,
    mangaDetailRefreshQueryOptions(db, queryClient, mangaId),
    signal,
  );
}
