import { useEffect, useState } from 'react';
import {
  evictCacheToLimit,
  holdReaderLocks,
  listCachedChapterPageIndexes,
  markChapterPagesAsRead,
  prefetchChapterPages,
  type CoverCacheContextValue,
} from '@app/cache';
import { formatUnavailableOfflinePages } from '../offline-pages.js';
import type { ReaderPageData } from '../reader-page-data.js';

/**
 * A rejected reader lock leaves this tab invisible to other tabs' eviction
 * probes, so the chapter it is reading can be reclaimed underneath it. Reading
 * cannot block on the lock, so the failure is surfaced instead of swallowed.
 */
function reportReaderLocksUnavailable(): void {
  // oxlint-disable-next-line no-console -- ruling: web-console-diagnostics: a missing reader lock is non-fatal and has no UI state; this warn is the only signal that another tab cannot see this open chapter.
  // react-doctor-disable-next-line eslint/no-console -- ruling: web-console-diagnostics: a missing reader lock is non-fatal and has no UI state; this warn is the only signal that another tab cannot see this open chapter.
  console.warn('[reader] Web Locks unavailable; another tab may evict this open chapter.');
}

/** Warms the chapter's pages into the blob cache and marks them read. */
export function useChapterPrefetch(
  data: ReaderPageData | undefined,
  cacheContext: CoverCacheContextValue | null,
  activePageIndex = data?.initialPageIndex ?? 0,
): void {
  // Depend on the chapter's page array, ids, and budget — not on `data`, which
  // is replaced whenever a reader setting changes. A settings toggle must not
  // re-run the whole prefetch sweep.
  const pages = data?.chapter.pages;
  const providerId = data?.providerId;
  const mangaId = data?.mangaId;
  const chapterId = data?.chapterId;
  const budgetBytes = data?.settings.prefetchBudgetBytes ?? 0;
  const preloadAhead = data?.settings.preloadAhead ?? 0;
  const lowMemoryMode = data?.settings.lowMemoryMode ?? false;
  const preloadCount = lowMemoryMode ? Math.min(1, preloadAhead) : preloadAhead;

  // The locks live as long as this chapter is open, not as long as one prefetch
  // sweep: a settings change releases and re-runs the sweep below, and a gap
  // there would let another tab evict the chapter being read.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: Web Locks presence must be held until the reader unmounts
  useEffect(() => {
    if (providerId === undefined || mangaId === undefined || chapterId === undefined) {
      return;
    }
    return holdReaderLocks({ providerId, mangaId, chapterId }, reportReaderLocksUnavailable);
  }, [chapterId, mangaId, providerId]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: prefetching writes to the DB and blob storage
  useEffect(() => {
    if (
      pages === undefined ||
      providerId === undefined ||
      mangaId === undefined ||
      chapterId === undefined ||
      cacheContext === null ||
      preloadCount === 0
    ) {
      return;
    }

    const controller = new AbortController();
    const prefetchPages = pages
      .slice(activePageIndex + 1, activePageIndex + 1 + preloadCount)
      .map((page) => ({
        pageIndex: page.index,
        remoteUrl: page.image.url,
      }));

    void prefetchChapterPages({
      db: cacheContext.db,
      adapter: cacheContext.adapter,
      providerId,
      mangaId,
      chapterId,
      pages: prefetchPages,
      retention: 'read',
      budgetBytes,
      signal: controller.signal,
    }).then(async () => {
      // Unmounting cancels the sweep; the rows it already wrote are still a
      // valid prefetch, but no cleanup may run against a route that is gone.
      if (controller.signal.aborted) return;
      await markChapterPagesAsRead(cacheContext.db, { providerId, mangaId, chapterId });
      if (controller.signal.aborted) return;
      await evictCacheToLimit(cacheContext.db, cacheContext.adapter, {
        limitBytes: cacheContext.cacheLimitBytes,
        // The chapter being read stays cached even when it alone is over budget.
        protectChapter: { providerId, mangaId, chapterId },
      });
    });

    return () => {
      controller.abort();
    };
  }, [
    activePageIndex,
    budgetBytes,
    cacheContext,
    chapterId,
    mangaId,
    pages,
    preloadCount,
    providerId,
  ]);
}

/**
 * Offline, a partially cached chapter renders its cached pages and blanks the
 * rest. Naming the missing ones is the difference between "readable offline"
 * and a truthful report of what the cache actually holds.
 */
export function useOfflinePagesNote(
  data: ReaderPageData | undefined,
  cacheContext: CoverCacheContextValue | null,
  isOffline: boolean,
): string | null {
  // Keyed by chapter so a note resolved for the previous chapter can never be
  // rendered for the next one while the lookup below is in flight.
  const [offlinePages, setOfflinePages] = useState<{ key: string; note: string | null }>({
    key: '',
    note: null,
  });

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the cached-page lookup is a DB read
  useEffect(() => {
    if (!isOffline || !data || cacheContext === null) return;

    const key = `${data.providerId}:${data.mangaId}:${data.chapterId}`;
    let cancelled = false;

    void listCachedChapterPageIndexes(cacheContext.db, {
      providerId: data.providerId,
      mangaId: data.mangaId,
      chapterId: data.chapterId,
    }).then((cached) => {
      if (cancelled) return;
      setOfflinePages({
        key,
        note: formatUnavailableOfflinePages(
          data.chapter.pages.map((page) => page.index),
          cached,
        ),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [cacheContext, data, isOffline]);

  if (!isOffline || !data) return null;
  const key = `${data.providerId}:${data.mangaId}:${data.chapterId}`;
  return offlinePages.key === key ? offlinePages.note : null;
}
