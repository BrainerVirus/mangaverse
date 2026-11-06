import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPageDecodePool, type CoverCacheContextValue, type PageDecodePool } from '@app/cache';

import { createPreloadPlan } from '../preload.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { resolveScrollPreloadAhead } from '../scroll-layout.js';

const DECODE_AHEAD_WINDOW = 6;
const DECODE_AHEAD_LOW_MEMORY_WINDOW = 2;

/**
 * Keeps the pages around the active one decoded, in the same priority order the
 * prefetch sweep uses. Data saver empties the plan: only the mounted page image
 * loads the page being read. It only ever warms already-cached pages: a page still
 * downloading is left to the prefetch sweep and its budget, then picked up when
 * `warmVersion` advances after that sweep settles.
 */
export function useDecodeAhead(input: {
  readonly data: ReaderPageData | undefined;
  readonly cacheContext: CoverCacheContextValue | null;
  readonly activePageIndex: number;
}): {
  readonly pool: PageDecodePool | null;
  /** Re-runs the current plan, after a sweep cached new pages. */
  readonly warm: () => void;
} {
  const { data, cacheContext, activePageIndex } = input;
  const pages = data?.chapter.pages;
  const providerId = data?.providerId;
  const mangaId = data?.mangaId;
  const chapterId = data?.chapterId;
  const lowMemoryMode = data?.settings.lowMemoryMode ?? false;
  const preloadBehind = data?.engineSettings.preloadBehind ?? 1;
  const dataSaver = data?.settings.dataSaver ?? false;
  const maxDisplayEdge = data?.engineSettings.displayMaxEdgePx;
  const preloadCount = resolveScrollPreloadAhead({
    pages: pages ?? [],
    preloadAhead: data?.settings.preloadAhead ?? 0,
    lowMemoryMode,
    longStripOptimization: data?.settings.longStripOptimization ?? false,
    dataSaver,
  });

  const pool = useMemo<PageDecodePool | null>(() => {
    if (cacheContext === null || providerId === undefined || mangaId === undefined) return null;
    if (chapterId === undefined) return null;
    return createPageDecodePool({
      db: cacheContext.db,
      adapter: cacheContext.adapter,
      providerId,
      mangaId,
      chapterId,
      maxDisplayEdge,
      concurrency: lowMemoryMode ? 1 : 2,
      maxEntries: lowMemoryMode ? DECODE_AHEAD_LOW_MEMORY_WINDOW : DECODE_AHEAD_WINDOW,
    });
  }, [cacheContext, chapterId, lowMemoryMode, mangaId, maxDisplayEdge, providerId]);

  const plan = useMemo(
    () =>
      pages === undefined
        ? []
        : createPreloadPlan(pages, activePageIndex, preloadCount, lowMemoryMode, {
            includeActive: true,
            preloadBehind,
            dataSaver,
          }).items.map((item) => ({ pageIndex: item.pageIndex, remoteUrl: item.url })),
    [activePageIndex, dataSaver, lowMemoryMode, pages, preloadBehind, preloadCount],
  );

  const planRef = useRef(plan);
  // One plan per turn. Pages that leave the window release their bitmap and
  // their URL reference inside the pool.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the decode pool owns detached image elements outside React
  useEffect(() => {
    planRef.current = plan;
    if (pool === null) return;
    pool.setPlan(plan);
  }, [plan, pool]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: releasing every decoded page on unmount
  useEffect(() => {
    if (pool === null) return;
    return () => pool.dispose();
  }, [pool]);

  const warm = useCallback(() => {
    pool?.setPlan(planRef.current);
  }, [pool]);

  return { pool, warm };
}
