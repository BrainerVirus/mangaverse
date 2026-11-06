import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useStateReducer } from '@app/design-system';
import { findActiveScrollPage, type ScrollPageMetric } from '../scroll-layout.js';

/** The pages whose rows overlap the scroll viewport, in index order. */
export interface VisibleRange {
  readonly start: number;
  readonly end: number;
}

function intersectingRange(
  metrics: readonly ScrollPageMetric[],
  heights: readonly number[],
  scrollTop: number,
  viewportHeight: number,
): VisibleRange | null {
  let start = -1;
  let end = -1;
  for (let index = 0; index < metrics.length; index += 1) {
    const top = metrics[index]?.top ?? 0;
    const bottom = top + (heights[index] ?? 0);
    if (bottom > scrollTop && top < scrollTop + viewportHeight) {
      if (start === -1) start = index;
      end = index;
    }
  }
  return start === -1 ? null : { start, end };
}

/**
 * Scroll-frame work for the strip: the centred page, and the pages the
 * viewport actually shows (which data saver mounts). Kept out of the component
 * so its render body stays about layout.
 */
export function useScrollActivity({
  containerRef,
  geometryWidthRef,
  metricsRef,
  heights,
  activePageIndex,
  measurePages,
  onActivePageChange,
  onFrame,
}: {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly geometryWidthRef: RefObject<{ readonly width: number }>;
  readonly metricsRef: RefObject<readonly ScrollPageMetric[]>;
  readonly heights: readonly number[];
  readonly activePageIndex: number;
  readonly measurePages: () => readonly ScrollPageMetric[];
  readonly onActivePageChange: (index: number) => void;
  /** Runs at the end of each scroll frame, after the active page and range settle. */
  readonly onFrame?: (container: HTMLElement) => void;
}): {
  readonly visibleRange: VisibleRange;
  readonly handleScroll: () => void;
  readonly refreshRange: (container: HTMLElement) => void;
} {
  const frameRef = useRef<number | null>(null);
  // A frame can run after a modal opened; read the latest callback, not the one
  // captured when the frame was scheduled.
  const onFrameRef = useRef(onFrame);
  useLayoutEffect(() => {
    onFrameRef.current = onFrame;
  });
  // Data saver mounts the pages the viewport shows, so the range moves with the
  // scroll even when the centred page does not change.
  const [visibleRange, setVisibleRange] = useStateReducer<VisibleRange, VisibleRange>(
    (_current, next) => next,
    { start: activePageIndex, end: activePageIndex },
  );

  // Recompute the visible range from the current geometry and scroll position.
  // The layout effect calls it after every commit, so a resize, a measured
  // shape or a programmatic jump updates the range without a scroll event.
  const refreshRange = useCallback(
    (container: HTMLElement) => {
      const height = container.clientHeight;
      const current = geometryWidthRef.current.width > 0 ? metricsRef.current : measurePages();
      const range = intersectingRange(current, heights, container.scrollTop, height);
      if (
        range !== null &&
        (range.start !== visibleRange.start || range.end !== visibleRange.end)
      ) {
        setVisibleRange(range);
      }
    },
    [
      geometryWidthRef,
      heights,
      measurePages,
      metricsRef,
      setVisibleRange,
      visibleRange.end,
      visibleRange.start,
    ],
  );

  // The active index is read from this render's closure (not a ref written
  // during render): the listener is rebound on every active-page change, so the
  // handler always compares against the page the strip is actually on.
  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const height = container.clientHeight;
      const center = container.scrollTop + height / 2;
      // A measurable container means the computed offsets are trustworthy and
      // no layout read is needed on a scroll frame; an unmeasurable one (jsdom)
      // falls back to the mounted rows.
      const current = geometryWidthRef.current.width > 0 ? metricsRef.current : measurePages();
      const next = findActiveScrollPage(current, center);
      if (next !== activePageIndex) {
        onActivePageChange(next);
      }
      refreshRange(container);
      onFrameRef.current?.(container);
    });
  }, [
    activePageIndex,
    containerRef,
    geometryWidthRef,
    measurePages,
    metricsRef,
    onActivePageChange,
    refreshRange,
  ]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the pending rAF belongs to the browser frame loop
  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  return { visibleRange, handleScroll, refreshRange };
}
