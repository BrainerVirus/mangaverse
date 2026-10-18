import { useCallback, useEffect, useRef, useState } from 'react';
import { CachedPageImage } from '@app/cache';
import type { ReaderPage } from '../types.js';
import {
  findActiveScrollPage,
  windowedScrollPages,
  type ScrollPageMetric,
} from '../scroll-layout.js';

export interface ReaderScrollViewHandle {
  scrollToPage: (index: number, behavior?: ScrollBehavior) => void;
  /** Live page offsets/sizes, so callers can centre a target page themselves. */
  measurePages: () => readonly ScrollPageMetric[];
  /** The scrolling element, for callers that compute their own offset. */
  scrollContainer: () => HTMLElement | null;
}

interface ReaderScrollViewProps {
  readonly pages: readonly ReaderPage[];
  readonly gapPx: number;
  readonly activePageIndex: number;
  readonly onActivePageChange: (index: number) => void;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
  readonly cacheReady: boolean;
  readonly reducedMotion: boolean;
  readonly onHandle: (handle: ReaderScrollViewHandle | null) => void;
}

const WINDOW_RADIUS = 3;

/**
 * Continuous vertical strip (webtoon). Pages outside the window render as
 * placeholders so a long chapter never mounts every cached blob at once, and
 * scroll position drives the active page instead of the other way around.
 */
export function ReaderScrollView({
  pages,
  gapPx,
  activePageIndex,
  onActivePageChange,
  providerId,
  mangaId,
  chapterId,
  cacheReady,
  reducedMotion,
  onHandle,
}: ReaderScrollViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageNodes = useRef<(HTMLDivElement | null)[]>([]);
  const frameRef = useRef<number | null>(null);
  const [spacerPx, setSpacerPx] = useState(0);

  const measurePages = useCallback((): readonly ScrollPageMetric[] => {
    const metrics: ScrollPageMetric[] = [];
    for (const [index, node] of pageNodes.current.entries()) {
      if (node === null) continue;
      metrics.push({ index, top: node.offsetTop, height: node.offsetHeight });
    }
    metrics.sort((a, b) => a.top - b.top);
    return metrics;
  }, []);

  const scrollToPage = useCallback(
    (index: number, behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth') => {
      const container = containerRef.current;
      const node = pageNodes.current[index];
      if (!container || !node) return;
      container.scrollTo({ top: node.offsetTop, behavior });
    },
    [reducedMotion],
  );

  // react-doctor-disable-next-line team-conventions/no-use-effect -- imperative handle publication: the parent stores the handle in a ref, which has no other lifecycle seam
  useEffect(() => {
    onHandle({ scrollToPage, measurePages, scrollContainer: () => containerRef.current });
    return () => onHandle(null);
  }, [measurePages, onHandle, scrollToPage]);

  // Resume position: jump (never animate) to the active page on mount.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- mount-only DOM commit: the node offsets are not readable until the strip is in the document
  useEffect(() => {
    const container = containerRef.current;
    const node = pageNodes.current[activePageIndex];
    if (!container || !node) return;
    container.scrollTop = node.offsetTop;
    // Mount-only: later active changes come from scrolling, not the other way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Half a viewport of slack after the last page, so it can be centred too —
  // without it the final short page could never reach the viewport centre.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: ResizeObserver on the scroll container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setSpacerPx(container.clientHeight / 2);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // The active index is read from this render's closure (not a ref written
  // during render): the listener is rebound on every active-page change, so the
  // handler always compares against the page the strip is actually on.
  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const metrics = measurePages();
      const center = container.scrollTop + container.clientHeight / 2;
      const next = findActiveScrollPage(metrics, center);
      if (next !== activePageIndex) {
        onActivePageChange(next);
      }
    });
  }, [activePageIndex, measurePages, onActivePageChange]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the pending rAF belongs to the browser frame loop
  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  const mounted = windowedScrollPages(pages, activePageIndex, WINDOW_RADIUS);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-y-auto overscroll-contain"
      onScroll={handleScroll}
      data-testid="reader-scroll-view"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${Math.max(0, gapPx)}px` }}>
        {pages.map((page, index) => (
          <div
            key={page.id}
            ref={(node) => {
              pageNodes.current[index] = node;
            }}
            data-page-index={index}
            style={{ aspectRatio: '2 / 3' }}
            className="w-full shrink-0"
          >
            {cacheReady && mounted.has(index) ? (
              <CachedPageImage
                providerId={providerId}
                mangaId={mangaId}
                chapterId={chapterId}
                pageIndex={page.index}
                remoteUrl={page.image.url}
                className="h-auto w-full select-none"
                retention="read"
              />
            ) : (
              <div className="h-full w-full animate-pulse bg-muted/40" aria-hidden />
            )}
          </div>
        ))}
        {spacerPx > 0 ? <div aria-hidden style={{ height: `${spacerPx}px` }} /> : null}
      </div>
    </div>
  );
}
