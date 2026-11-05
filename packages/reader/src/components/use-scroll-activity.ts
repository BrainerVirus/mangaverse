import { useCallback, useEffect, useRef, type RefObject } from 'react';
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
}: {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly geometryWidthRef: RefObject<{ readonly width: number }>;
  readonly metricsRef: RefObject<readonly ScrollPageMetric[]>;
  readonly heights: readonly number[];
  readonly activePageIndex: number;
  readonly measurePages: () => readonly ScrollPageMetric[];
  readonly onActivePageChange: (index: number) => void;
}): { readonly visibleRange: VisibleRange; readonly handleScroll: () => void } {
  const frameRef = useRef<number | null>(null);
  // Data saver mounts the pages the viewport shows, so the range moves with the
  // scroll even when the centred page does not change.
  const [visibleRange, setVisibleRange] = useStateReducer<VisibleRange, VisibleRange>(
    (_current, next) => next,
    { start: activePageIndex, end: activePageIndex },
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
      const range = intersectingRange(current, heights, container.scrollTop, height);
      if (
        range !== null &&
        (range.start !== visibleRange.start || range.end !== visibleRange.end)
      ) {
        setVisibleRange(range);
      }
    });
  }, [
    activePageIndex,
    containerRef,
    geometryWidthRef,
    heights,
    measurePages,
    metricsRef,
    onActivePageChange,
    setVisibleRange,
    visibleRange.end,
    visibleRange.start,
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

  return { visibleRange, handleScroll };
}
