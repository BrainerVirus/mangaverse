import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useStateReducer } from '@app/design-system';
import { findActiveScrollPage, type ScrollPageMetric } from '../scroll-layout.js';

/** The pages whose rows overlap the scroll viewport, in index order. */
export interface VisibleRange {
  readonly start: number;
  readonly end: number;
}

/**
 * What the viewport shows right now, to the tile: the first and last pages on
 * screen and, inside them, where the viewport starts and ends (page-local
 * pixels, snapped outwards to the tile height so a scroll frame inside one tile
 * changes nothing). `null` is an empty viewport: it sits in a gap between pages.
 */
export interface ScreenSpan {
  readonly start: number;
  readonly end: number;
  /** Where the viewport starts inside page `start`, floored to the tile height. */
  readonly startFrom: number;
  /** Where the viewport ends inside page `end`, ceiled to the tile height. */
  readonly endTo: number;
}

export function screenSpan(
  metrics: readonly ScrollPageMetric[],
  heights: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  tileHeight: number,
): ScreenSpan | null {
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
  if (start === -1) return null;
  const quantum = Math.max(1, tileHeight);
  const startLocal = Math.max(0, scrollTop - (metrics[start]?.top ?? 0));
  const endLocal = scrollTop + viewportHeight - (metrics[end]?.top ?? 0);
  return {
    start,
    end,
    startFrom: Math.floor(startLocal / quantum) * quantum,
    endTo: Math.ceil(endLocal / quantum) * quantum,
  };
}

/**
 * The part of page `index` on screen, page-local: `[from, to)`, empty (`0, 0`)
 * when the page is not on screen. Pages between the first and last run whole.
 */
export function pageScreenBounds(
  span: ScreenSpan | null,
  index: number,
): { readonly from: number; readonly to: number } {
  if (span === null || index < span.start || index > span.end) return { from: 0, to: 0 };
  return {
    from: index === span.start ? span.startFrom : 0,
    to: index === span.end ? span.endTo : Number.POSITIVE_INFINITY,
  };
}

interface ScrollScreen {
  /**
   * The pages the viewport last showed. In a gap it keeps the pages around it:
   * data saver mounts these, and a gap must not unmount the pages either side.
   */
  readonly visibleRange: VisibleRange;
  /** What is on screen now; `null` in a gap. Only what is on screen animates. */
  readonly span: ScreenSpan | null;
}

function sameSpan(a: ScreenSpan | null, b: ScreenSpan | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.start === b.start && a.end === b.end && a.startFrom === b.startFrom && a.endTo === b.endTo
  );
}

function sameScreen(a: ScrollScreen, b: ScrollScreen): boolean {
  return (
    a.visibleRange.start === b.visibleRange.start &&
    a.visibleRange.end === b.visibleRange.end &&
    sameSpan(a.span, b.span)
  );
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
  tileHeight,
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
  /** The tile height: the on-screen span is snapped to it, so it changes per tile, not per frame. */
  readonly tileHeight: number;
}): {
  readonly visibleRange: VisibleRange;
  readonly screen: ScreenSpan | null;
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
  const [screen, setScreen] = useStateReducer<ScrollScreen, ScrollScreen>(
    (_current, next) => next,
    {
      visibleRange: { start: activePageIndex, end: activePageIndex },
      span: { start: activePageIndex, end: activePageIndex, startFrom: 0, endTo: tileHeight },
    },
  );
  const { visibleRange } = screen;

  // Recompute the visible range from the current geometry and scroll position.
  // The layout effect calls it after every commit, so a resize, a measured
  // shape or a programmatic jump updates the range without a scroll event.
  const refreshRange = useCallback(
    (container: HTMLElement) => {
      const height = container.clientHeight;
      // An unmeasurable container (not laid out yet, hidden, jsdom) shows nothing to measure
      // against: keep what is known rather than call the strip empty.
      if (height <= 0) return;
      const current = geometryWidthRef.current.width > 0 ? metricsRef.current : measurePages();
      const span = screenSpan(current, heights, container.scrollTop, height, tileHeight);
      const next = {
        visibleRange: span === null ? screen.visibleRange : { start: span.start, end: span.end },
        span,
      };
      // Only a page or a tile entering or leaving the viewport commits.
      if (!sameScreen(screen, next)) setScreen(next);
    },
    [geometryWidthRef, heights, measurePages, metricsRef, screen, setScreen, tileHeight],
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

  return { visibleRange, screen: screen.span, handleScroll, refreshRange };
}
