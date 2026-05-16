import type {
  ReaderSessionInput,
  ReaderState,
  ZoomStateSummary,
  ReaderDiagnosticsSnapshot,
} from './types.js';

export function createReaderState(input: ReaderSessionInput): ReaderState {
  const { chapter, viewport, settings, initialPageIndex = 0 } = input;
  const pageCount = chapter.pageCount;

  const clampedPageIndex = Math.max(0, Math.min(initialPageIndex, pageCount - 1));

  const mode = settings.readingMode === 'vertical' ? 'scroll' : 'page';

  const visiblePageIndexes = [clampedPageIndex];

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