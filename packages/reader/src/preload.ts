import type {
  ReaderPage,
  PreloadItem,
  PreloadPlan,
  DecodeQueueItem,
  DecodeQueue,
  PageLoadResult,
} from './types';

const MAX_RETRIES = 3;

export function createPreloadPlan(
  pages: readonly ReaderPage[],
  activePageIndex: number,
  preloadAhead: number,
  lowMemoryMode: boolean,
): PreloadPlan {
  const effectiveMaxPreload = lowMemoryMode ? 1 : preloadAhead;
  const items: PreloadItem[] = [];

  for (let i = 1; i <= effectiveMaxPreload; i++) {
    const pageIndex = activePageIndex + i;
    if (pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const distance = i;
    const priority = Math.max(0, 100 - distance * 10);

    items.push({
      pageIndex,
      priority,
      url: page.image.url,
    });
  }

  return {
    items,
    lowMemoryMode,
    maxPreload: effectiveMaxPreload,
  };
}

export function createDecodeQueue(
  pages: readonly ReaderPage[],
  activePageIndex: number,
  preloadAhead: number,
  lowMemoryMode: boolean,
): DecodeQueue {
  const effectiveMaxPreload = lowMemoryMode ? 1 : preloadAhead;
  const items: DecodeQueueItem[] = [];

  for (let i = 1; i <= effectiveMaxPreload; i++) {
    const pageIndex = activePageIndex + i;
    if (pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const distance = i;
    const priority = Math.max(0, 100 - distance * 10);

    items.push({
      pageIndex,
      url: page.image.url,
      priority,
      retryCount: 0,
    });
  }

  items.sort((a, b) => b.priority - a.priority);

  return {
    items,
    totalPages: pages.length,
  };
}

export function recordPageLoadResult(
  result: PageLoadResult,
  pages: readonly ReaderPage[],
  activePageIndex: number,
  failedPages: readonly number[],
  preloadAhead: number,
): {
  failedPages: readonly number[];
  preloadQueue: readonly number[];
} {
  const newFailedPages = [...failedPages];
  let preloadQueue: readonly number[] = [];

  if (result.success) {
    return {
      failedPages: newFailedPages as unknown as readonly number[],
      preloadQueue,
    };
  }

  if (!newFailedPages.includes(result.pageIndex)) {
    newFailedPages.push(result.pageIndex);
  } else {
    return {
      failedPages: newFailedPages,
      preloadQueue: [],
    };
  }

  const retriesForPage = newFailedPages.filter(
    (p) => p === result.pageIndex,
  ).length;

  if (retriesForPage <= MAX_RETRIES) {
    preloadQueue = [result.pageIndex];
  }

  return {
    failedPages: newFailedPages,
    preloadQueue,
  };
}