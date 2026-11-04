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
 * `metrics` must be sorted by `top` (strip order); it is searched with a binary
 * search so a scroll frame stays O(log n) on a long chapter.
 */
export function findActiveScrollPage(
  metrics: readonly ScrollPageMetric[],
  viewportCenter: number,
): number {
  if (metrics.length === 0) return 0;

  // Last page whose top is at or above the center: the only candidate whose
  // body can contain it, and its successor when the center falls in a gap.
  let low = 0;
  let high = metrics.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    const metric = metrics[middle];
    if (metric !== undefined && metric.top <= viewportCenter) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const candidate = metrics[low];
  const first = metrics[0];
  if (candidate === undefined || first === undefined) return 0;
  if (viewportCenter < candidate.top + candidate.height) return candidate.index;
  const next = metrics[low + 1];
  return next === undefined ? candidate.index : next.index;
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

/** A page at least three screens tall is a long strip, not an ordinary page. */
export const LONG_STRIP_ASPECT_RATIO = 3;

/** The 2:3 placeholder used until a page's real shape is known. */
const PLACEHOLDER_ASPECT_RATIO = 2 / 3;
/** Height/width of the placeholder page: the shape the strip assumes by default. */
export const PLACEHOLDER_PAGE_RATIO = 1 / PLACEHOLDER_ASPECT_RATIO;

/**
 * A strip row taller than this is split into tiles. 4096 keeps every rendered
 * box under the common GPU texture limit (4096–16384 px depending on the
 * device) while leaving ordinary pages and short strips as one image.
 */
const STRIP_TILE_THRESHOLD_PX = 8192;
export const STRIP_TILE_HEIGHT_PX = 4096;

/**
 * The box a page occupies at a given strip width. Provider metadata wins; a
 * page with no dimensions keeps the 2:3 placeholder until its image reports
 * its natural size, which the caller feeds back in as `natural`.
 */
export function resolveStripPageSize(
  page: ReaderPage,
  natural?: { readonly width: number; readonly height: number },
  fallbackRatio = PLACEHOLDER_PAGE_RATIO,
): { readonly width: number; readonly height: number; readonly ratio: number } {
  const width = page.image.width ?? page.width ?? natural?.width;
  const height = page.image.height ?? page.height ?? natural?.height;
  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    return { width, height, ratio: height / width };
  }
  return { width: 1, height: fallbackRatio, ratio: fallbackRatio };
}

/** A rendered page height at `stripWidth`, using the page's shape. */
export function stripPageHeight(
  page: ReaderPage,
  stripWidth: number,
  natural?: { readonly width: number; readonly height: number },
  fallbackRatio = PLACEHOLDER_PAGE_RATIO,
): number {
  const size = resolveStripPageSize(page, natural, fallbackRatio);
  return Math.max(1, Math.round(Math.max(0, stripWidth) * size.ratio));
}

/** Whether a page's shape is already known from provider metadata. */
export function hasPageShape(page: ReaderPage): boolean {
  const width = page.image.width ?? page.width;
  const height = page.image.height ?? page.height;
  return width !== undefined && height !== undefined && width > 0 && height > 0;
}

export interface PageTile {
  /** Offset into the page image where this tile starts, in CSS pixels. */
  readonly offset: number;
  readonly height: number;
}

/**
 * Splits a page tall enough to hit browser image limits into renderable tiles.
 * Ordinary pages stay a single tile, so the strip pays nothing for this.
 */
export function planPageTiles(
  height: number,
  tileHeight = STRIP_TILE_HEIGHT_PX,
  threshold = STRIP_TILE_THRESHOLD_PX,
): readonly PageTile[] {
  const total = Math.max(1, Math.round(height));
  const size = Math.max(1, Math.round(tileHeight));
  if (total <= threshold || total <= size) return [{ offset: 0, height: total }];

  const tiles: PageTile[] = [];
  for (let offset = 0; offset < total; offset += size) {
    tiles.push({ offset, height: Math.min(size, total - offset) });
  }
  return tiles;
}

export function isLongStripPage(page: ReaderPage): boolean {
  const width = page.image.width ?? page.width;
  const height = page.image.height ?? page.height;
  return (
    width !== undefined &&
    height !== undefined &&
    width > 0 &&
    height / width >= LONG_STRIP_ASPECT_RATIO
  );
}

/**
 * Long-strip optimization keeps a single page of look-ahead around the active
 * one: a chapter of 10,000px strips would otherwise decode several full strips
 * into memory for one scroll frame.
 */
export function resolveScrollPreloadAhead(input: {
  readonly pages: readonly ReaderPage[];
  readonly preloadAhead: number;
  readonly lowMemoryMode?: boolean;
  readonly longStripOptimization?: boolean;
}): number {
  const base = input.lowMemoryMode ? Math.min(1, input.preloadAhead) : input.preloadAhead;
  if (input.longStripOptimization !== true) return base;
  return input.pages.some(isLongStripPage) ? Math.min(base, 1) : base;
}
