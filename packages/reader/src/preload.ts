import type {
  ReaderPage,
  PreloadItem,
  PreloadPlan,
  PageLoadResult,
  PreloadRetryState,
} from './types';

export interface PreloadPlanOptions {
  /** Pages to keep warm behind the active one (`preloadBehind`); one when absent. */
  readonly preloadBehind?: number;
  /**
   * Whether the active page itself belongs in the plan. The prefetch sweep
   * leaves it out because the mounted page image already loads it, while the
   * decode pool keeps it first: it is the page a turn must never wait on.
   */
  readonly includeActive?: boolean;
}

/**
 * Every page worth warming, in the order the reader should work on them:
 * the active page, its neighbours, then the pages ahead of the turn direction.
 * Pages behind the active one follow, so a backward turn finds them warm
 * without the plan ever spending the first slots on them.
 *
 * `priority` is the ordered rank as a number (higher first) and exists for the
 * diagnostics snapshot; consumers must keep the array order because two items
 * can round to the same priority on a long chapter.
 */
export function createPreloadPlan(
  pages: readonly ReaderPage[],
  activePageIndex: number,
  preloadAhead: number,
  lowMemoryMode: boolean,
  options: PreloadPlanOptions = {},
): PreloadPlan {
  const includeActive = options.includeActive !== false;
  const maxAhead = Math.max(0, lowMemoryMode ? Math.min(1, preloadAhead) : preloadAhead);
  const maxBehind = Math.max(0, lowMemoryMode ? 0 : (options.preloadBehind ?? 1));
  const active = Math.max(0, Math.min(activePageIndex, pages.length - 1));

  // Candidate order is the reading order the reader cares about, not page order:
  // a page turn is the expensive event, so everything within one turn of the
  // active page outranks a page two turns away.
  const order: { readonly pageIndex: number; readonly distance: number }[] = [];
  if (includeActive && pages[active] !== undefined) {
    order.push({ pageIndex: active, distance: 0 });
  }
  if (maxBehind >= 1 && active - 1 >= 0) order.push({ pageIndex: active - 1, distance: 1 });
  if (maxAhead >= 1 && active + 1 < pages.length)
    order.push({ pageIndex: active + 1, distance: 1 });
  for (let distance = 2; distance <= maxAhead; distance += 1) {
    if (active + distance < pages.length) order.push({ pageIndex: active + distance, distance });
  }
  for (let distance = 2; distance <= maxBehind; distance += 1) {
    if (active - distance >= 0) order.push({ pageIndex: active - distance, distance });
  }

  const items: PreloadItem[] = [];
  for (const [rank, candidate] of order.entries()) {
    const page = pages[candidate.pageIndex];
    if (page === undefined) continue;
    items.push({
      pageIndex: candidate.pageIndex,
      // Rank, not distance: neighbours on both sides share a distance but the
      // plan must still feed them to the queue one at a time.
      priority: Math.max(0, 1000 - rank * 10),
      url: page.image.url,
    });
  }

  return {
    items,
    lowMemoryMode,
    maxPreload: maxAhead,
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
      failedPages: newFailedPages.filter(
        (p) => p !== result.pageIndex,
      ) as unknown as readonly number[],
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
