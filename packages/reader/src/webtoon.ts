import type { ReaderSessionInput } from './types';

export interface WebtoonWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly preloadEndIndex: number;
  readonly totalHeight: number;
}

export interface PagePosition {
  readonly index: number;
  readonly top: number;
  readonly height: number;
}

export interface WebtoonLayout {
  readonly totalHeight: number;
  readonly pageCount: number;
  readonly pagePositions: readonly PagePosition[];
}

export function estimateWebtoonLayout(input: ReaderSessionInput): WebtoonLayout {
  const { chapter, viewport, settings } = input;
  const verticalGap = settings.verticalGapPx ?? 0;

  const pagePositions: PagePosition[] = [];
  let totalHeight = 0;

  for (let i = 0; i < chapter.pages.length; i++) {
    const page = chapter.pages[i]!;
    const height = page.image?.height ?? viewport.height;
    const width = page.image?.width ?? viewport.width;

    const scale = viewport.width / width;
    const scaledHeight = height * scale;

    pagePositions.push({
      index: i,
      top: totalHeight,
      height: scaledHeight,
    });

    totalHeight += scaledHeight;

    if (i < chapter.pages.length - 1) {
      totalHeight += verticalGap;
    }
  }

  return {
    totalHeight,
    pageCount: chapter.pageCount,
    pagePositions,
  };
}

export function calculateWebtoonWindow(
  input: ReaderSessionInput,
  scrollPercent: number,
  totalHeight: number,
): WebtoonWindow {
  const { chapter, viewport, settings } = input;
  const { preloadAhead, lowMemoryMode } = settings;

  const layout = estimateWebtoonLayout(input);
  const { pagePositions } = layout;

  const effectiveTotalHeight = totalHeight > 0 ? totalHeight : layout.totalHeight;
  const viewportHeight = viewport.height;
  const scrollOffset = (scrollPercent / 100) * effectiveTotalHeight;

  const visibleTop = scrollOffset;
  const visibleBottom = scrollOffset + viewportHeight;

  let startIndex = chapter.pages.length - 1;
  let endIndex = 0;
  let foundOverlap = false;

  for (let i = 0; i < pagePositions.length; i++) {
    const pos = pagePositions[i]!;
    const pageTop = pos.top;
    const pageBottom = pageTop + pos.height;

    const overlapsVisible = pageBottom > visibleTop && pageTop < visibleBottom;

    if (overlapsVisible) {
      if (!foundOverlap) {
        startIndex = i;
        foundOverlap = true;
      }
      endIndex = i;
    } else if (pageBottom <= visibleTop) {
      // Page is above visible area - can skip but don't break
      continue;
    } else if (pageTop >= visibleBottom) {
      // Page is below visible area - can break
      break;
    }
  }

  if (!foundOverlap) {
    startIndex = 0;
  }

  let preloadEndIndex = endIndex;

  if (preloadAhead > 0) {
    const effectivePreload = lowMemoryMode ? Math.min(preloadAhead, 1) : preloadAhead;
    preloadEndIndex = Math.min(endIndex + effectivePreload, chapter.pages.length - 1);
  }

  return {
    startIndex,
    endIndex,
    preloadEndIndex,
    totalHeight: effectiveTotalHeight,
  };
}