import { useCallback, useRef, type RefObject } from 'react';

/** Sub-pixel scroll positions: a fractional `scrollTop` must still reach a threshold at its maximum. */
const THRESHOLD_TOLERANCE_PX = 1;

/** Scroll room the tail spacer always gives, as a fraction of the viewport height. */
const MIN_TAIL_SPACER_RATIO = 0.5;

/** The tail spacer height: at least half a viewport, and enough to reach the threshold. */
export function tailSpacerPx(viewportHeight: number, thresholdPercent: number): number {
  return viewportHeight * Math.max(MIN_TAIL_SPACER_RATIO, thresholdPercent / 100);
}

/**
 * Whether the strip is scrolled past the end of its last page by the
 * threshold. At 0 the last page's bottom sits at the viewport bottom; each
 * further percent of the viewport height adds that much scroll, so 100 puts the
 * bottom at the viewport top.
 */
function isPastChapterEnd({
  scrollTop,
  viewportHeight,
  lastPageBottom,
  thresholdPercent,
}: {
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly lastPageBottom: number;
  readonly thresholdPercent: number;
}): boolean {
  const overscroll = scrollTop + viewportHeight - lastPageBottom;
  return overscroll >= (viewportHeight * thresholdPercent) / 100 - THRESHOLD_TOLERANCE_PX;
}

/**
 * Offers the next chapter once per crossing of the scroll-past threshold.
 * `seed` records where the strip opened, so a resume position that already
 * sits past the threshold does not count as a crossing; `check` runs on each
 * scroll frame and fires on the frame that moves from below to past. Scrolling
 * back below re-arms it, and a remounted strip starts over.
 */
export function useChapterEndThreshold({
  thresholdPercent,
  lastPageBottomRef,
  onChapterEnd,
}: {
  readonly thresholdPercent: number;
  /** The bottom edge of the last page, in scroll-content pixels. */
  readonly lastPageBottomRef: RefObject<number>;
  readonly onChapterEnd: (() => void) | undefined;
}): {
  readonly seed: (container: HTMLElement) => void;
  readonly check: (container: HTMLElement) => void;
} {
  const pastRef = useRef<boolean | null>(null);

  const measure = useCallback(
    (container: HTMLElement) =>
      isPastChapterEnd({
        scrollTop: container.scrollTop,
        viewportHeight: container.clientHeight,
        lastPageBottom: lastPageBottomRef.current,
        thresholdPercent,
      }),
    [lastPageBottomRef, thresholdPercent],
  );

  const seed = useCallback(
    (container: HTMLElement) => {
      pastRef.current = measure(container);
    },
    [measure],
  );

  const check = useCallback(
    (container: HTMLElement) => {
      const past = measure(container);
      const wasPast = pastRef.current === true;
      pastRef.current = past;
      if (past && !wasPast) onChapterEnd?.();
    },
    [measure, onChapterEnd],
  );

  return { seed, check };
}
