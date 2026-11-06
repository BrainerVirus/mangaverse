import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CachedPageImage } from '@app/cache';
import { useStateReducer } from '@app/design-system';
import { READER_NEXT_CHAPTER_THRESHOLD_DEFAULT_PERCENT } from '@app/shared';
import type { ReaderPage } from '../types.js';
import { tailSpacerPx, useChapterEndThreshold } from './use-chapter-end-threshold.js';
import { useScrollActivity } from './use-scroll-activity.js';
import { resolveStripWindows } from './strip-windows.js';
import {
  computeScrollPageMetrics,
  hasPageShape,
  planPageTiles,
  PLACEHOLDER_PAGE_RATIO,
  STRIP_TILE_AUTO_THRESHOLD_PX,
  STRIP_TILE_HEIGHT_PX,
  resolveStripMaxWidthPercent,
  resolveStripPageSize,
  stripPageHeight,
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
  /** The strip width setting (`maxStripWidthPercent`); 100 is Auto. */
  readonly maxWidthPercent?: number;
  readonly activePageIndex: number;
  readonly onActivePageChange: (index: number) => void;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
  readonly cacheReady: boolean;
  readonly reducedMotion: boolean;
  readonly onHandle: (handle: ReaderScrollViewHandle | null) => void;
  readonly preloadAhead?: number;
  readonly lowMemoryMode?: boolean;
  readonly longStripOptimization?: boolean;
  /** Only the pages intersecting the viewport mount; no speculative look-ahead. */
  readonly dataSaver?: boolean;
  /** Pages taller than this many pixels render as tiles; Auto (8192) when absent. */
  readonly tilingThresholdPx?: number;
  /** Display downscale cap for page images; the original when absent. */
  readonly displayMaxEdgePx?: number | undefined;
  readonly imageSmoothing?: boolean;
  readonly onPageMetric?:
    | ((metric: {
        pageIndex: number;
        status: 'loaded' | 'failed';
        fromCache: boolean;
        durationMs: number;
      }) => void)
    | undefined;
  readonly onBack?: (() => void) | undefined;
  /**
   * How far past the last page's end, in percent of the viewport height, the
   * strip scrolls before `onChapterEnd` is called; once per crossing.
   */
  readonly nextChapterThresholdPercent?: number;
  readonly onChapterEnd?: (() => void) | undefined;
}

/** Extra rows around the image window, so a scroll reveals rows before it lands. */
const ROW_OVERSCAN = 2;
/** Minimum rows either side even when images are limited to one (low memory). */
const MIN_ROW_RADIUS = 3;
/**
 * Strip width used when the container has no measurable box yet (first commit,
 * a hidden surface, jsdom). Matches the reader viewport's own fallback so the
 * first computed row heights are in the right ballpark.
 */
const DEFAULT_STRIP_WIDTH = 800;

interface NaturalSize {
  readonly width: number;
  readonly height: number;
}

interface StripGeometry {
  /** The scroll container's width; the strip itself may be narrower. */
  readonly width: number;
  /** The scroll container's height, for the reachable tail room. */
  readonly viewportHeight: number;
  readonly spacerPx: number;
  readonly natural: Readonly<Record<number, NaturalSize>>;
  /**
   * Shape assumed for pages with no dimensions yet. Provider metadata is the
   * first source; with none at all, the first decoded page teaches the strip
   * the chapter's real shape, so the remaining pages never reflow.
   */
  readonly fallbackRatio: number;
}

type GeometryEvent =
  | {
      readonly type: 'resize';
      readonly width: number;
      readonly viewportHeight: number;
      readonly spacerPx: number;
    }
  | {
      readonly type: 'measured';
      readonly index: number;
      readonly size: NaturalSize;
      readonly fallbackRatio: number;
    };

const EMPTY_GEOMETRY: StripGeometry = {
  width: 0,
  viewportHeight: 0,
  spacerPx: 0,
  natural: {},
  fallbackRatio: PLACEHOLDER_PAGE_RATIO,
};

function geometryReducer(state: StripGeometry, event: GeometryEvent): StripGeometry {
  if (event.type === 'resize') {
    if (
      state.width === event.width &&
      state.viewportHeight === event.viewportHeight &&
      state.spacerPx === event.spacerPx
    ) {
      return state;
    }
    return {
      ...state,
      width: event.width,
      viewportHeight: event.viewportHeight,
      spacerPx: event.spacerPx,
    };
  }
  const previous = state.natural[event.index];
  if (
    previous !== undefined &&
    previous.width === event.size.width &&
    previous.height === event.size.height
  ) {
    return state;
  }
  return {
    ...state,
    fallbackRatio: event.fallbackRatio,
    natural: { ...state.natural, [event.index]: event.size },
  };
}

interface ScrollContentProps {
  readonly pages: readonly ReaderPage[];
  readonly rowWindow: ReadonlySet<number>;
  readonly imageWindow: ReadonlySet<number>;
  readonly metrics: readonly ScrollPageMetric[];
  readonly heights: readonly number[];
  readonly geometry: StripGeometry;
  readonly widthPercent: number;
  readonly contentHeight: number;
  readonly totalHeight: number;
  readonly spacerPx: number;
  readonly cacheReady: boolean;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
  readonly imageSmoothing: boolean;
  readonly tilingThresholdPx: number;
  readonly displayMaxEdgePx: number | undefined;
  readonly onSkipPage: (index: number) => void;
  readonly onBack: (() => void) | undefined;
  readonly onMeasured: (index: number, size: NaturalSize) => void;
  readonly onMetric:
    | ((metric: {
        pageIndex: number;
        status: 'loaded' | 'failed';
        fromCache: boolean;
        durationMs: number;
      }) => void)
    | undefined;
}

/** The virtualised rows and the tail spacer, inside the centred content column. */
function ScrollContent({
  pages,
  rowWindow,
  imageWindow,
  metrics,
  heights,
  geometry,
  widthPercent,
  contentHeight,
  totalHeight,
  spacerPx,
  cacheReady,
  providerId,
  mangaId,
  chapterId,
  imageSmoothing,
  tilingThresholdPx,
  displayMaxEdgePx,
  onSkipPage,
  onBack,
  onMeasured,
  onMetric,
}: ScrollContentProps) {
  return (
    <div
      className="relative mx-auto"
      style={{ height: contentHeight, width: `${widthPercent}%` }}
      data-testid="reader-scroll-content"
    >
      {pages.map((page, index) => {
        if (!rowWindow.has(index)) return null;
        const metric = metrics[index];
        const height = heights[index] ?? 0;
        const size = resolveStripPageSize(page, geometry.natural[index], geometry.fallbackRatio);
        return (
          <ScrollPageRow
            key={page.id}
            page={page}
            index={index}
            top={metric?.top ?? 0}
            height={height}
            aspectRatio={`${size.width} / ${size.height}`}
            mounted={imageWindow.has(index)}
            cacheReady={cacheReady}
            providerId={providerId}
            mangaId={mangaId}
            chapterId={chapterId}
            onSkipPage={onSkipPage}
            onBack={onBack}
            imageSmoothing={imageSmoothing}
            tilingThresholdPx={tilingThresholdPx}
            displayMaxEdgePx={displayMaxEdgePx}
            onMeasured={onMeasured}
            onMetric={onMetric}
          />
        );
      })}
      {spacerPx > 0 ? (
        <div
          aria-hidden
          className="absolute left-0 w-full"
          style={{ top: totalHeight, height: spacerPx }}
        />
      ) : null}
    </div>
  );
}

/**
 * One strip row, absolutely positioned from the computed geometry. Placeholder
 * rows carry no data that changes while scrolling, so memoising them keeps a
 * page turn down to the rows entering/leaving the window instead of a
 * re-render of the chapter's whole list.
 *
 * A page taller than the tiling threshold renders as several clipped tiles of
 * the same image: each box stays inside browser image/texture limits while the
 * reader scrolls through it as one continuous page.
 */
const ScrollPageRow = memo(function ScrollPageRow({
  page,
  index,
  top,
  height,
  aspectRatio,
  mounted,
  cacheReady,
  providerId,
  mangaId,
  chapterId,
  onSkipPage,
  onBack,
  imageSmoothing,
  tilingThresholdPx,
  displayMaxEdgePx,
  onMeasured,
  onMetric,
}: {
  readonly page: ReaderPage;
  readonly index: number;
  readonly top: number;
  readonly height: number;
  readonly aspectRatio: string;
  readonly mounted: boolean;
  readonly cacheReady: boolean;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
  readonly onSkipPage?: ((index: number) => void) | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly imageSmoothing: boolean;
  readonly tilingThresholdPx: number;
  readonly displayMaxEdgePx: number | undefined;
  readonly onMeasured: (index: number, size: NaturalSize) => void;
  readonly onMetric?:
    | ((metric: {
        pageIndex: number;
        status: 'loaded' | 'failed';
        fromCache: boolean;
        durationMs: number;
      }) => void)
    | undefined;
}) {
  const tiles = planPageTiles(height, STRIP_TILE_HEIGHT_PX, tilingThresholdPx);
  return (
    <div
      data-page-index={index}
      style={{ top, height, aspectRatio }}
      className="absolute left-0 w-full"
    >
      {tiles.map((tile) => (
        <div
          key={tile.offset}
          data-page-tile={tile.offset}
          className="relative w-full overflow-hidden"
          style={{ height: tile.height }}
        >
          {cacheReady && mounted ? (
            // The image keeps its full rendered height and is shifted up by the
            // tile offset; the tile clips it. Every tile shares one blob URL.
            <div className="absolute left-0 w-full" style={{ top: -tile.offset }}>
              <CachedPageImage
                providerId={providerId}
                mangaId={mangaId}
                chapterId={chapterId}
                pageIndex={page.index}
                remoteUrl={page.image.url}
                className="h-auto w-full select-none"
                retention="read"
                imageRendering={imageSmoothing ? 'auto' : 'pixelated'}
                maxDisplayEdge={displayMaxEdgePx}
                onLoad={tile.offset === 0 ? (size) => onMeasured(index, size) : undefined}
                onSkip={onSkipPage ? () => onSkipPage(index) : undefined}
                onBack={onBack}
                onMetric={
                  onMetric === undefined || tile.offset !== 0
                    ? undefined
                    : (metric) => onMetric({ pageIndex: index, ...metric })
                }
              />
            </div>
          ) : (
            <div className="h-full w-full animate-pulse bg-muted/40" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
});

/** Measured offsets of the rows currently in the DOM, sorted for the search. */
function readPageMetrics(container: HTMLElement): readonly ScrollPageMetric[] {
  const metrics: ScrollPageMetric[] = [];
  for (const node of container.querySelectorAll<HTMLElement>('[data-page-index]')) {
    const height = node.offsetHeight;
    // An unmeasurable row (no layout, or not painted yet) must not overwrite
    // its computed geometry with zeroes.
    if (height <= 0) continue;
    metrics.push({
      index: Number(node.dataset['pageIndex']),
      top: node.offsetTop,
      height,
    });
  }
  return metrics.sort((a, b) => a.top - b.top);
}

/**
 * Continuous vertical strip (webtoon). Only the rows around the active page
 * mount at all — the rest are represented by the strip's computed height — so a
 * 200-page chapter keeps a fixed row count, image count and DOM size. Scroll
 * position drives the active page instead of the other way around; offsets
 * come from page shapes (provider metadata or the loaded natural size), which
 * is what the absolutely positioned rows render.
 */
export function ReaderScrollView({
  pages,
  gapPx,
  maxWidthPercent = 100,
  activePageIndex,
  onActivePageChange,
  providerId,
  mangaId,
  chapterId,
  cacheReady,
  reducedMotion,
  onHandle,
  preloadAhead = MIN_ROW_RADIUS,
  lowMemoryMode = false,
  longStripOptimization = false,
  dataSaver = false,
  tilingThresholdPx = STRIP_TILE_AUTO_THRESHOLD_PX,
  displayMaxEdgePx,
  imageSmoothing = true,
  onPageMetric,
  onBack,
  nextChapterThresholdPercent = READER_NEXT_CHAPTER_THRESHOLD_DEFAULT_PERCENT,
  onChapterEnd,
}: ReaderScrollViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Width, tail spacer and measured natural sizes move together: a resize
  // changes every row height, and a page's real shape changes every offset
  // below it. One reducer keeps that single render coherent.
  const [geometry, dispatchGeometry] = useStateReducer(geometryReducer, EMPTY_GEOMETRY);
  const geometryRef = useRef<StripGeometry>(geometry);

  // The container stays full width, so the scrollbar and tap zones keep the
  // whole reader; only the content wrapper narrows and every row height comes
  // from the narrowed width.
  const containerWidth = geometry.width;
  const measuredWidth = containerWidth > 0 ? containerWidth : DEFAULT_STRIP_WIDTH;
  const widthPercent = resolveStripMaxWidthPercent(maxWidthPercent, measuredWidth);
  const stripWidth = (containerWidth * widthPercent) / 100;
  const spacerPx = geometry.spacerPx;
  const geometryWidth = (measuredWidth * widthPercent) / 100;
  const stripWidthRef = useRef(stripWidth);
  const pagesHaveMetadata = useMemo(() => pages.some(hasPageShape), [pages]);
  const heights = useMemo(
    () =>
      pages.map((page, index) =>
        stripPageHeight(page, geometryWidth, geometry.natural[index], geometry.fallbackRatio),
      ),
    [geometry.fallbackRatio, geometry.natural, geometryWidth, pages],
  );
  const metrics = useMemo(
    () =>
      computeScrollPageMetrics(
        pages.map((_page, index) => ({ index, height: heights[index] ?? 0 })),
        gapPx,
      ),
    [gapPx, heights, pages],
  );
  const metricsRef = useRef<readonly ScrollPageMetric[]>(metrics);
  // A jump to an unmounted page lands on its estimate; once the window moves
  // and the real row mounts, the row's own offset is the truth.
  const pendingCorrectionRef = useRef<{ readonly index: number; readonly top: number } | null>(
    null,
  );
  const pagesRef = useRef(pages);

  const totalHeight =
    metrics.length === 0 ? 0 : (metrics[metrics.length - 1]!.top ?? 0) + (heights.at(-1) ?? 0);
  // A chapter shorter than the viewport must still have room to scroll to the
  // next-chapter threshold; otherwise the gesture can never fire it.
  const thresholdPx = (geometry.viewportHeight * nextChapterThresholdPercent) / 100;
  const effectiveSpacerPx = Math.max(
    spacerPx,
    geometry.viewportHeight > 0 ? geometry.viewportHeight + thresholdPx + 1 - totalHeight : 0,
  );
  const contentHeight = totalHeight + effectiveSpacerPx;
  const lastPageBottomRef = useRef(totalHeight);
  const chapterEnd = useChapterEndThreshold({
    thresholdPercent: nextChapterThresholdPercent,
    lastPageBottomRef,
    onChapterEnd,
  });

  const offsetOf = useCallback((index: number): number => metricsRef.current[index]?.top ?? 0, []);

  const measurePages = useCallback((): readonly ScrollPageMetric[] => {
    const container = containerRef.current;
    if (container === null) return metricsRef.current;
    const measured = readPageMetrics(container);
    if (measured.length === 0) return metricsRef.current;
    // The mounted rows are exact; unmounted pages keep their computed offsets.
    // A row whose loaded size differs from the estimate recomputes every
    // offset through `reportMeasured`, so no global drift correction is needed.
    const byIndex = new Map(metricsRef.current.map((metric) => [metric.index, metric]));
    for (const metric of measured) byIndex.set(metric.index, metric);
    return [...byIndex.values()].sort((a, b) => a.top - b.top);
  }, []);

  const scrollToPage = useCallback(
    (index: number, behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth') => {
      const container = containerRef.current;
      if (container === null) return;
      const node = container.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
      const top = node === null ? offsetOf(index) : node.offsetTop;
      pendingCorrectionRef.current = node === null ? { index, top } : null;
      // A far jump is instant for the same reason keyboard navigation is: the
      // rows it mounts re-measure mid-animation and a moving target cancels it.
      const far = Math.abs(top - container.scrollTop) > container.clientHeight * 1.5;
      container.scrollTo({ top, behavior: far ? 'auto' : behavior });
    },
    [offsetOf, reducedMotion],
  );
  // A jump to an unmounted page lands on its estimate; once the window moves
  // and the real row mounts, the row's own offset is the truth.

  // react-doctor-disable-next-line team-conventions/no-use-effect -- imperative handle publication: the parent stores the handle in a ref, which has no other lifecycle seam
  useEffect(() => {
    onHandle({ scrollToPage, measurePages, scrollContainer: () => containerRef.current });
    return () => onHandle(null);
  }, [measurePages, onHandle, scrollToPage]);

  // Resume position: jump (never animate) to the active page on mount.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- mount-only DOM commit: the strip must exist before its offset can be read
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const node = container.querySelector<HTMLElement>(`[data-page-index="${activePageIndex}"]`);
    container.scrollTop = node === null ? offsetOf(activePageIndex) : node.offsetTop;
    // Where the strip opened is the baseline: a resume past the threshold is not a crossing.
    chapterEnd.seed(container);
    // Mount-only: later active changes come from scrolling, not the other way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The container box drives the row heights; the observer also refreshes the
  // metrics cache when the width (and therefore every offset) changes.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: ResizeObserver on the scroll container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      dispatchGeometry({
        type: 'resize',
        width: container.clientWidth,
        viewportHeight: container.clientHeight,
        // Room to scroll past the end, enough to reach the next-chapter threshold.
        spacerPx: tailSpacerPx(container.clientHeight, nextChapterThresholdPercent),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [dispatchGeometry, nextChapterThresholdPercent]);

  const { visibleRange, handleScroll, refreshRange } = useScrollActivity({
    containerRef,
    geometryWidthRef: geometryRef,
    metricsRef,
    heights,
    activePageIndex,
    measurePages,
    onActivePageChange,
    onFrame: chapterEnd.check,
  });

  // React commits are the only place a row can enter/leave the DOM; after each
  // one, finish a pending jump against the row that just mounted.
  useLayoutEffect(() => {
    metricsRef.current = metrics;
    geometryRef.current = geometry;
    stripWidthRef.current = stripWidth;
    pagesRef.current = pages;
    lastPageBottomRef.current = totalHeight;
    const pending = pendingCorrectionRef.current;
    const container = containerRef.current;
    if (container !== null) refreshRange(container);
    if (pending !== null && container !== null) {
      const node = container.querySelector<HTMLElement>(`[data-page-index="${pending.index}"]`);
      if (node !== null) {
        const delta = node.offsetTop - pending.top;
        if (Math.abs(delta) > 1) container.scrollTop += delta;
        pendingCorrectionRef.current = null;
      }
    }
  });

  /**
   * A page's real shape arrives after its image decodes. Correct the offset of
   * everything below it, and — when the page is above the viewport — move the
   * scroll position by the same delta so the reader's visible content stays put
   * instead of jumping by the placeholder's error.
   */
  const reportMeasured = useCallback(
    (index: number, size: NaturalSize) => {
      const current = geometryRef.current;
      const previous = current.natural[index];
      if (
        previous !== undefined &&
        previous.width === size.width &&
        previous.height === size.height
      ) {
        return;
      }
      const page = pagesRef.current[index];
      // With no provider dimensions anywhere in the chapter, the first decoded
      // page is the best evidence of the chapter's shape. Adopting it for every
      // unloaded page keeps the strip's geometry stable instead of reflowing
      // 2:3 → real ratio page by page (which cancels a long jump mid-animation).
      const adoptFallback =
        !pagesHaveMetadata &&
        current.fallbackRatio === PLACEHOLDER_PAGE_RATIO &&
        size.width > 0 &&
        size.height > 0;
      const fallbackRatio = adoptFallback ? size.height / size.width : current.fallbackRatio;
      if (page !== undefined && size.width > 0 && size.height > 0) {
        const width = stripWidthRef.current;
        const before = stripPageHeight(page, width, previous, current.fallbackRatio);
        const after = stripPageHeight(page, width, size, fallbackRatio);
        const delta = after - before;
        const top = metricsRef.current[index]?.top;
        const container = containerRef.current;
        if (delta !== 0 && top !== undefined && container !== null && container.scrollTop > top) {
          container.scrollTop += delta;
        }
      }
      // Keep the ref ahead of the commit so two loads in one commit each measure
      // from the geometry the other one just produced.
      geometryRef.current = {
        ...current,
        fallbackRatio,
        natural: { ...current.natural, [index]: size },
      };
      dispatchGeometry({ type: 'measured', index, size, fallbackRatio });
    },
    [dispatchGeometry, pagesHaveMetadata],
  );

  const skipPage = useCallback(
    (index: number) => scrollToPage(Math.min(index + 1, pages.length - 1)),
    [pages.length, scrollToPage],
  );
  const { imageWindow, rowWindow } = resolveStripWindows({
    pages,
    activePageIndex,
    natural: geometry.natural,
    preloadAhead,
    lowMemoryMode,
    longStripOptimization,
    dataSaver,
    visibleRange,
    minRowRadius: MIN_ROW_RADIUS,
    rowOverscan: ROW_OVERSCAN,
  });

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-y-auto overscroll-contain"
      onScroll={handleScroll}
      data-testid="reader-scroll-view"
      // Test seam: page tops let E2E drive a virtualised strip without needing
      // the target row to be mounted.
      data-page-offsets={JSON.stringify(metrics.map((metric) => metric.top))}
      data-page-count={pages.length}
    >
      <ScrollContent
        pages={pages}
        rowWindow={rowWindow}
        imageWindow={imageWindow}
        metrics={metrics}
        heights={heights}
        geometry={geometry}
        widthPercent={widthPercent}
        contentHeight={contentHeight}
        totalHeight={totalHeight}
        spacerPx={effectiveSpacerPx}
        cacheReady={cacheReady}
        providerId={providerId}
        mangaId={mangaId}
        chapterId={chapterId}
        imageSmoothing={imageSmoothing}
        tilingThresholdPx={tilingThresholdPx}
        displayMaxEdgePx={displayMaxEdgePx}
        onSkipPage={skipPage}
        onBack={onBack}
        onMeasured={reportMeasured}
        onMetric={onPageMetric}
      />
    </div>
  );
}
