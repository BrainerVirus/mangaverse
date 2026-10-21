import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
 * One strip row. Placeholder rows carry no data that changes while scrolling,
 * so memoising them keeps a page turn down to the two rows leaving/entering
 * the window instead of the whole chapter's list.
 */
const ScrollPageRow = memo(function ScrollPageRow({
  page,
  index,
  mounted,
  cacheReady,
  providerId,
  mangaId,
  chapterId,
}: {
  readonly page: ReaderPage;
  readonly index: number;
  readonly mounted: boolean;
  readonly cacheReady: boolean;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
}) {
  return (
    <div data-page-index={index} style={{ aspectRatio: '2 / 3' }} className="w-full shrink-0">
      {cacheReady && mounted ? (
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
  );
});

/**
 * Reads page offsets once. Document order is strip order, so the result is
 * already sorted by `top` — the precondition for the binary search in
 * `findActiveScrollPage`.
 */
function readPageMetrics(container: HTMLElement): readonly ScrollPageMetric[] {
  const metrics: ScrollPageMetric[] = [];
  for (const node of container.querySelectorAll<HTMLElement>('[data-page-index]')) {
    metrics.push({
      index: Number(node.dataset['pageIndex']),
      top: node.offsetTop,
      height: node.offsetHeight,
    });
  }
  return metrics;
}

function pageNode(container: HTMLElement, index: number): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
}

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
  const frameRef = useRef<number | null>(null);
  // Measured page offsets, invalidated by any container or strip resize (an
  // image load, a gap change or a rotated device all change one of them).
  const metricsRef = useRef<readonly ScrollPageMetric[] | null>(null);
  const containerHeightRef = useRef(0);
  const [spacerPx, setSpacerPx] = useState(0);

  const measurePages = useCallback((): readonly ScrollPageMetric[] => {
    const container = containerRef.current;
    if (container === null) return [];
    return readPageMetrics(container);
  }, []);

  // Scroll frames must not read layout: the first frame measures once, later
  // frames search the cached offsets.
  const currentMetrics = useCallback((): readonly ScrollPageMetric[] => {
    const container = containerRef.current;
    if (container === null) return [];
    metricsRef.current ??= readPageMetrics(container);
    return metricsRef.current;
  }, []);

  const scrollToPage = useCallback(
    (index: number, behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth') => {
      const container = containerRef.current;
      const node = container === null ? null : pageNode(container, index);
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
    const node = container === null ? null : pageNode(container, activePageIndex);
    if (!container || !node) return;
    container.scrollTop = node.offsetTop;
    // Mount-only: later active changes come from scrolling, not the other way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Half a viewport of slack after the last page, so it can be centred too —
  // without it the final short page could never reach the viewport centre.
  // The same observer invalidates the metrics cache: the container box and the
  // strip height are the only inputs page offsets derive from.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: ResizeObserver on the scroll container and strip
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const strip = container.firstElementChild;
    const update = () => {
      containerHeightRef.current = container.clientHeight;
      setSpacerPx(container.clientHeight / 2);
      metricsRef.current = null;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    if (strip !== null) observer.observe(strip);
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
      const height = containerHeightRef.current || container.clientHeight;
      const center = container.scrollTop + height / 2;
      const next = findActiveScrollPage(currentMetrics(), center);
      if (next !== activePageIndex) {
        onActivePageChange(next);
      }
    });
  }, [activePageIndex, currentMetrics, onActivePageChange]);

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
          <ScrollPageRow
            key={page.id}
            page={page}
            index={index}
            mounted={mounted.has(index)}
            cacheReady={cacheReady}
            providerId={providerId}
            mangaId={mangaId}
            chapterId={chapterId}
          />
        ))}
        {spacerPx > 0 ? <div aria-hidden style={{ height: `${spacerPx}px` }} /> : null}
      </div>
    </div>
  );
}
