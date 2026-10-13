import { useCallback, useEffect, useRef } from 'react';
import { CachedPageImage } from '@app/cache';
import type { ReaderPage } from '../types.js';
import { findActiveScrollPage, windowedScrollPages, type ScrollPageMetric } from '../scroll-layout.js';

export interface ReaderScrollViewHandle {
  scrollToPage: (index: number, behavior?: ScrollBehavior) => void;
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
  const activeRef = useRef(activePageIndex);
  activeRef.current = activePageIndex;

  const scrollToPage = useCallback(
    (index: number, behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth') => {
      const container = containerRef.current;
      const node = pageNodes.current[index];
      if (!container || !node) return;
      container.scrollTo({ top: node.offsetTop, behavior });
    },
    [reducedMotion],
  );

  useEffect(() => {
    onHandle({ scrollToPage });
    return () => onHandle(null);
  }, [onHandle, scrollToPage]);

  // Resume position: jump (never animate) to the active page on mount.
  useEffect(() => {
    const container = containerRef.current;
    const node = pageNodes.current[activeRef.current];
    if (!container || !node) return;
    container.scrollTop = node.offsetTop;
    // Mount-only: later active changes come from scrolling, not the other way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const metrics: ScrollPageMetric[] = [];
      for (const [index, node] of pageNodes.current.entries()) {
        if (node === null) continue;
        metrics.push({ index, top: node.offsetTop, height: node.offsetHeight });
      }
      metrics.sort((a, b) => a.top - b.top);
      const center = container.scrollTop + container.clientHeight / 2;
      const next = findActiveScrollPage(metrics, center);
      if (next !== activeRef.current) {
        onActivePageChange(next);
      }
    });
  }, [onActivePageChange]);

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
      </div>
    </div>
  );
}
