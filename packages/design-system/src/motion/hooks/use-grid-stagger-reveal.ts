import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gridStaggerReveal } from '../shell/grid-stagger-reveal.js';
import { useReducedMotion } from './use-reduced-motion.js';

/** The library marks its cards; any other grid names its items with a selector. */
const LIBRARY_CARD_SELECTOR = '[data-library-card]';

/**
 * Reveals a grid's items when `itemsKey` changes (a new result set, not a scroll). Items are the
 * elements `selector` matches inside the returned ref's element; `:scope > *` takes its children.
 */
export function useGridStaggerReveal(
  itemsKey: string,
  enabled: boolean,
  selector: string = LIBRARY_CARD_SELECTOR,
) {
  const gridRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const lastAnimatedKeyRef = useRef<string | null>(null);
  const revealRef = useRef<ReturnType<typeof gridStaggerReveal> | null>(null);

  useGSAP(
    () => {
      if (!enabled || !gridRef.current) return;
      // Reduced motion also lands here when it turns on mid-reveal: the items must show at once.
      if (!reducedMotion && lastAnimatedKeyRef.current === itemsKey) return;

      const cards = gridRef.current.querySelectorAll(selector);
      if (cards.length === 0) return;

      if (!reducedMotion) lastAnimatedKeyRef.current = itemsKey;
      // The tween already running is stopped by handle: killing by target does not reach a stagger.
      const running = revealRef.current;
      if (running !== null)
        for (const tween of Array.isArray(running) ? running : [running]) tween.kill();
      revealRef.current = gridStaggerReveal(cards, { reducedMotion });
    },
    { scope: gridRef, dependencies: [itemsKey, enabled, reducedMotion, selector] },
  );

  return gridRef;
}
