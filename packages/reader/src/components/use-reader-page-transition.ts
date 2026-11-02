import { useRef, type RefObject } from 'react';
import { readerPageEnter, useGsapContext } from '@app/design-system/motion';
import type { PageTransitionMode } from '@app/shared';

/**
 * Animates the page layer after a page change. The GSAP context reverts the
 * previous tween before the next one starts, so a second navigation cancels
 * the first immediately; the first committed page never animates.
 */
export function useReaderPageTransition({
  pageLayer,
  activePageIndex,
  mode,
  rtl,
  reducedMotion,
}: {
  readonly pageLayer: RefObject<HTMLDivElement | null>;
  readonly activePageIndex: number | undefined;
  readonly mode: PageTransitionMode;
  readonly rtl: boolean;
  readonly reducedMotion: boolean;
}): void {
  const previousPageRef = useRef<number | null>(null);
  useGsapContext(pageLayer, () => {
    if (activePageIndex === undefined) return;
    const previous = previousPageRef.current;
    previousPageRef.current = activePageIndex;
    if (previous === null || previous === activePageIndex || pageLayer.current === null) return;
    readerPageEnter(pageLayer.current, mode, {
      reducedMotion,
      direction: activePageIndex > previous ? 'forward' : 'backward',
      rtl,
    });
  }, [activePageIndex, mode, reducedMotion, rtl]);
}
