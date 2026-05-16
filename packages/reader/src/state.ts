import type {
  ReaderSessionInput,
  ReaderState,
  ZoomStateSummary,
  ReaderDiagnosticsSnapshot,
  PageSlot,
} from './types.js';
import { calculatePageSlots } from './spreads.js';

function findActiveSpreadSlots(slots: readonly PageSlot[], activePageIndex: number): readonly PageSlot[] {
  const targetSlot = slots.find(s => s.pageIndex === activePageIndex);
  if (!targetSlot) return [];

  if (targetSlot.isCover || (!targetSlot.isLeftPage && !targetSlot.isRightPage)) {
    return [targetSlot];
  }

  const isLeftSlot = targetSlot.isLeftPage;
  const startIndex = slots.indexOf(targetSlot);

  const result: PageSlot[] = [targetSlot];

  if (isLeftSlot && startIndex + 1 < slots.length) {
    const nextSlot = slots[startIndex + 1];
    if (nextSlot && nextSlot.pageIndex === activePageIndex + 1) {
      result.push(nextSlot);
    }
  } else if (!isLeftSlot && startIndex - 1 >= 0) {
    const prevSlot = slots[startIndex - 1];
    if (prevSlot && prevSlot.pageIndex === activePageIndex - 1) {
      result.unshift(prevSlot);
    }
  }

  return result;
}

export function createReaderState(input: ReaderSessionInput): ReaderState {
  const { chapter, settings, initialPageIndex = 0 } = input;
  const pageCount = chapter.pageCount;

  const clampedPageIndex = Math.max(0, Math.min(initialPageIndex, pageCount - 1));

  const mode = settings.readingMode === 'vertical' ? 'scroll' : 'page';

  let visiblePageIndexes: readonly number[];

  if (mode === 'scroll') {
    visiblePageIndexes = [clampedPageIndex];
  } else {
    const slots = calculatePageSlots(input);
    const visibleSlots = findActiveSpreadSlots(slots, clampedPageIndex);
    if (visibleSlots.length > 1) {
      visiblePageIndexes = visibleSlots.map(s => s.pageIndex);
    } else {
      visiblePageIndexes = [clampedPageIndex];
    }
  }

  const preloadQueue = calculatePreloadQueue(
    clampedPageIndex,
    pageCount,
    settings.preloadAhead,
    settings.lowMemoryMode
  );

  const zoom: ZoomStateSummary = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    minZoom: settings.minZoom,
    maxZoom: settings.maxZoom,
  };

  const diagnostics: ReaderDiagnosticsSnapshot = {
    timestamp: new Date().toISOString(),
    chapterId: chapter.id,
    activePageIndex: clampedPageIndex,
    totalPages: pageCount,
    visiblePageIndexes,
    settings,
    zoom,
    chromeVisible: false,
    failedPageCount: 0,
    preloadQueueLength: preloadQueue.length,
    lowMemoryMode: settings.lowMemoryMode,
    events: [],
  };

  return {
    chapterId: chapter.id,
    pages: chapter.pages,
    settings,
    mode,
    activePageIndex: clampedPageIndex,
    visiblePageIndexes,
    layout: settings.pageLayout,
    zoom,
    chromeVisible: false,
    failedPages: [],
    preloadQueue,
    diagnostics,
  };
}

function calculatePreloadQueue(
  activePageIndex: number,
  totalPages: number,
  preloadAhead: number,
  lowMemoryMode: boolean
): readonly number[] {
  if (lowMemoryMode) {
    const nextIndex = activePageIndex + 1;
    return nextIndex < totalPages ? [nextIndex] : [];
  }

  const items: number[] = [];
  const maxPreload = lowMemoryMode ? 1 : preloadAhead;

  for (let i = 1; i <= maxPreload; i++) {
    const nextIndex = activePageIndex + i;
    if (nextIndex < totalPages) {
      items.push(nextIndex);
    }
  }

  return items;
}