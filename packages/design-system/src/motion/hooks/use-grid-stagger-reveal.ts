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

  useGSAP(
    () => {
      if (!enabled || !gridRef.current || reducedMotion) return;
      if (lastAnimatedKeyRef.current === itemsKey) return;

      const cards = gridRef.current.querySelectorAll(selector);
      if (cards.length === 0) return;

      lastAnimatedKeyRef.current = itemsKey;
      gridStaggerReveal(cards, { reducedMotion });
    },
    { scope: gridRef, dependencies: [itemsKey, enabled, reducedMotion, selector] },
  );

  return gridRef;
}
