import { resolveScrollPreloadAhead, windowedScrollPages } from '../scroll-layout.js';
import type { ReaderPage } from '../types.js';
import type { VisibleRange } from './use-scroll-activity.js';

interface NaturalSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The pages with each decoded shape written back, so the long-strip window can
 * see the real shape before anything stores it: provider dimensions are usually
 * absent, and the first decoded page is the only evidence the strip has.
 */
function withMeasuredShapes(
  pages: readonly ReaderPage[],
  natural: Readonly<Record<number, NaturalSize>>,
): readonly ReaderPage[] {
  return pages.map((page, index) => {
    const size = natural[index];
    return size === undefined
      ? page
      : { ...page, image: { ...page.image, width: size.width, height: size.height } };
  });
}

function rangeWindow(range: VisibleRange, pageCount: number): ReadonlySet<number> {
  const window = new Set<number>();
  for (
    let index = Math.max(0, range.start);
    index <= Math.min(pageCount - 1, range.end);
    index += 1
  ) {
    window.add(index);
  }
  return window;
}

function unionWindows(
  first: ReadonlySet<number>,
  second: ReadonlySet<number>,
): ReadonlySet<number> {
  return new Set([...first, ...second]);
}

/**
 * The rows to mount for a strip: the ordinary preload window, or with data
 * saver the pages the viewport shows (plus the ordinary rows for virtualisation).
 */
export function resolveStripWindows({
  pages,
  activePageIndex,
  natural,
  preloadAhead,
  lowMemoryMode,
  longStripOptimization,
  dataSaver,
  visibleRange,
  minRowRadius,
  rowOverscan,
}: {
  readonly pages: readonly ReaderPage[];
  readonly activePageIndex: number;
  readonly natural: Readonly<Record<number, NaturalSize>>;
  readonly preloadAhead: number;
  readonly lowMemoryMode: boolean;
  readonly longStripOptimization: boolean;
  readonly dataSaver: boolean;
  readonly visibleRange: VisibleRange;
  readonly minRowRadius: number;
  readonly rowOverscan: number;
}): { readonly imageWindow: ReadonlySet<number>; readonly rowWindow: ReadonlySet<number> } {
  const viewportWindow = rangeWindow(visibleRange, pages.length);
  const imageWindow = dataSaver
    ? viewportWindow
    : windowedScrollPages(
        pages,
        activePageIndex,
        resolveScrollPreloadAhead({
          pages: withMeasuredShapes(pages, natural),
          preloadAhead,
          lowMemoryMode,
          longStripOptimization,
        }),
      );
  const rowRadius = Math.max(
    minRowRadius + rowOverscan,
    imageWindow.size,
    preloadAhead + rowOverscan,
  );
  const rowWindow = dataSaver
    ? unionWindows(windowedScrollPages(pages, activePageIndex, rowRadius), viewportWindow)
    : windowedScrollPages(pages, activePageIndex, rowRadius);
  return { imageWindow, rowWindow };
}
