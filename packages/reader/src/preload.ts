import type {
  ReaderPage,
  PreloadItem,
  PreloadPlan,
  DecodeQueueItem,
  DecodeQueue,
  PageLoadResult,
  PreloadRetryState,
} from './types';

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

    const page = pages[pageIndex]!;
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

    const page = pages[pageIndex]!;
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
  _pages: readonly ReaderPage[],
  _activePageIndex: number,
  failedPages: readonly number[],
  maxRetries: number,
  retryState: PreloadRetryState = {},
): {
  failedPages: readonly number[];
  preloadQueue: readonly number[];
  retryState: PreloadRetryState;
} {
  const newFailedPages = [...failedPages];
  let preloadQueue: readonly number[] = [];
  const newRetryState = { ...retryState };

  if (result.success) {
    const { [result.pageIndex]: _removed, ...rest } = newRetryState;
    return {
      failedPages: newFailedPages.filter(p => p !== result.pageIndex) as unknown as readonly number[],
      preloadQueue,
      retryState: rest,
    };
  }

  if (!newFailedPages.includes(result.pageIndex)) {
    newFailedPages.push(result.pageIndex);
  }

  const currentRetry = newRetryState[result.pageIndex] ?? 0;
  const newRetry = currentRetry < maxRetries ? currentRetry + 1 : currentRetry;

  if (newRetry > currentRetry) {
    newRetryState[result.pageIndex] = newRetry;
  }

  if (newRetry < maxRetries) {
    preloadQueue = [result.pageIndex];
  }

  return {
    failedPages: newFailedPages as unknown as readonly number[],
    preloadQueue,
    retryState: newRetryState,
  };
}