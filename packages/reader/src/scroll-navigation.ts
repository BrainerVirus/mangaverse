import type { ReaderNavigationAction } from './types.js';
import type { ScrollPageMetric } from './scroll-layout.js';

/**
 * Index the keyboard navigation should land on, resolved from the last target
 * (not the centre-based active page): during a smooth scroll the active page
 * lags behind, so resolving from it drops rapid presses.
 */
export function resolveVerticalNavigationTarget(
  currentTarget: number,
  action: ReaderNavigationAction,
  pageCount: number,
): number {
  const lastIndex = Math.max(0, pageCount - 1);
  const clamp = (index: number) => Math.max(0, Math.min(index, lastIndex));

  switch (action.type) {
    case 'nextPage':
      return clamp(currentTarget + 1);
    case 'prevPage':
      return clamp(currentTarget - 1);
    case 'firstPage':
      return 0;
    case 'lastPage':
      return lastIndex;
    case 'goToPage':
      return clamp(action.pageIndex ?? currentTarget);
    default:
      return clamp(currentTarget);
  }
}

/**
 * Scroll offset that puts the target page's centre on the viewport centre.
 * Centring (not the page top) is what makes a page shorter than half the
 * viewport the active one after the scroll settles.
 */
export function computeScrollTargetTop(
  metrics: readonly ScrollPageMetric[],
  pageIndex: number,
  viewportHeight: number,
  scrollHeight: number,
): number {
  const metric = metrics.find((item) => item.index === pageIndex);
  if (metric === undefined) return 0;

  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  const centered = metric.top + metric.height / 2 - viewportHeight / 2;
  return Math.max(0, Math.min(centered, maxScroll));
}
