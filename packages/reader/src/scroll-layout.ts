import type { ReaderPage } from './types.js';

export interface ScrollPageMetric {
  readonly index: number;
  readonly top: number;
  readonly height: number;
}

export interface ScrollPageInput {
  readonly index: number;
  /** Rendered height in CSS pixels. */
  readonly height: number;
}

/**
 * Cumulative offsets for the vertical strip: page N starts after every previous
 * page plus one gap between each pair. Kept pure so the windowing math is unit
 * testable without a DOM.
 */
export function computeScrollPageMetrics(
  pages: readonly ScrollPageInput[],
  gapPx: number,
): readonly ScrollPageMetric[] {
  const gap = Math.max(0, gapPx);
  const metrics: ScrollPageMetric[] = [];
  let top = 0;
  for (const page of pages) {
    metrics.push({ index: page.index, top, height: Math.max(0, page.height) });
    top += Math.max(0, page.height) + gap;
  }
  return metrics;
}

/**
 * The page occupying the viewport center, clamped to the strip. The center (not
 * the top edge) keeps the active page stable while a tall page scrolls through.
 */
export function findActiveScrollPage(
  metrics: readonly ScrollPageMetric[],
  viewportCenter: number,
): number {
  if (metrics.length === 0) return 0;
  for (const metric of metrics) {
    if (viewportCenter < metric.top + metric.height) {
      return metric.index;
    }
  }
  const last = metrics[metrics.length - 1];
  return last === undefined ? 0 : last.index;
}

/** Page indexes to mount around the active one; the rest render placeholders. */
export function windowedScrollPages(
  pages: readonly ReaderPage[],
  activePageIndex: number,
  radius: number,
): ReadonlySet<number> {
  const mounted = new Set<number>();
  const from = Math.max(0, activePageIndex - radius);
  const to = Math.min(pages.length - 1, activePageIndex + radius);
  for (let index = from; index <= to; index += 1) {
    mounted.add(index);
  }
  return mounted;
}
