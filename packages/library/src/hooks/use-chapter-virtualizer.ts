import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { useScrollParent } from './use-scroll-parent.js';

/**
 * Rows below this count stay a plain list. A detail page with a handful of
 * chapters reads better unvirtualized, and jsdom renders no layout to window
 * against; large libraries (the 138-chapter case) window at this boundary.
 */
export const CHAPTER_VIRTUALIZE_MIN_ROWS = 40;

/** First-paint estimate for one row; `measureElement` corrects each mounted row. */
const CHAPTER_ROW_ESTIMATE_PX = 64;

export function shouldVirtualizeChapters(rowCount: number): boolean {
  return rowCount >= CHAPTER_VIRTUALIZE_MIN_ROWS;
}

/**
 * The list's offset inside its scroll parent. Unlike the search grid's hook this
 * one does not listen to scroll — the content offset does not change while
 * scrolling — so a long list re-measures only when the page above it resizes.
 */
function useListScrollMargin(
  containerRef: RefObject<HTMLElement | null>,
  scrollParent: HTMLElement | null,
): number {
  const [margin, setMargin] = useState(0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || scrollParent === null) {
      setMargin(0);
      return;
    }

    const updateMargin = () => {
      const listRect = element.getBoundingClientRect();
      const scrollRect = scrollParent.getBoundingClientRect();
      setMargin(listRect.top - scrollRect.top + scrollParent.scrollTop);
    };

    updateMargin();

    const observer = new ResizeObserver(updateMargin);
    observer.observe(element);
    observer.observe(scrollParent);
    window.addEventListener('resize', updateMargin);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMargin);
    };
  }, [containerRef, scrollParent]);

  return margin;
}

export interface ChapterVirtualizer {
  /** Attach to the list element in both the plain and the windowed path. */
  readonly containerRef: RefObject<HTMLOListElement | null>;
  /** True once a scroll parent is known and the row count crosses the threshold. */
  readonly isVirtualized: boolean;
  /** Offset of the list inside its scroll parent; subtract it from row start. */
  readonly scrollMargin: number;
  readonly totalSize: number;
  readonly rows: readonly VirtualItem[];
  readonly measureRow: (node: Element | null) => void;
}

/**
 * Window a uniform-height chapter list inside the page's single scroll parent.
 * Presentational only: the caller still owns the sorted rows and the data layer
 * is untouched. Keyboard and scroll reach every row because only the mounted
 * window exists in the DOM and the window follows the scroll position.
 */
export function useChapterVirtualizer(rowCount: number): ChapterVirtualizer {
  const containerRef = useRef<HTMLOListElement>(null);
  const { scrollParent } = useScrollParent(containerRef);
  const scrollMargin = useListScrollMargin(containerRef, scrollParent);
  const isVirtualized = scrollParent !== null && shouldVirtualizeChapters(rowCount);

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual returns imperative measure/getVirtualItems closures; skipping compiler memoization of this list is the intended, documented behaviour (ruling recorded)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParent,
    estimateSize: () => CHAPTER_ROW_ESTIMATE_PX,
    overscan: 8,
    scrollMargin,
    enabled: isVirtualized,
  });

  return {
    containerRef,
    isVirtualized,
    scrollMargin,
    totalSize: virtualizer.getTotalSize(),
    rows: isVirtualized ? virtualizer.getVirtualItems() : [],
    measureRow: virtualizer.measureElement,
  };
}
