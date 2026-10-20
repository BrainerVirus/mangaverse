import { useEffect, useState } from 'react';
import {
  listCachedChapterPageIndexes,
  markChapterPagesAsRead,
  prefetchChapterPages,
  type CoverCacheContextValue,
} from '@app/cache';
import { formatUnavailableOfflinePages } from '../offline-pages.js';
import type { ReaderPageData } from '../reader-page-data.js';

/** Warms the chapter's pages into the blob cache and marks them read. */
export function useChapterPrefetch(
  data: ReaderPageData | undefined,
  cacheContext: CoverCacheContextValue | null,
): void {
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: prefetching writes to the DB and blob storage
  useEffect(() => {
    if (!data || cacheContext === null) {
      return;
    }

    const pages = data.chapter.pages.map((page, pageIndex) => ({
      pageIndex,
      remoteUrl: page.image.url,
    }));

    void prefetchChapterPages({
      db: cacheContext.db,
      adapter: cacheContext.adapter,
      providerId: data.providerId,
      mangaId: data.mangaId,
      chapterId: data.chapterId,
      pages,
      retention: 'read',
      budgetBytes: data.settings.prefetchBudgetBytes,
    }).then(() =>
      markChapterPagesAsRead(cacheContext.db, {
        providerId: data.providerId,
        mangaId: data.mangaId,
        chapterId: data.chapterId,
      }),
    );
  }, [cacheContext, data]);
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
