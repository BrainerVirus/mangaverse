import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gridStaggerReveal } from '../shell/grid-stagger-reveal.js';
import { useReducedMotion } from './use-reduced-motion.js';

export function useGridStaggerReveal(itemsKey: string, enabled: boolean) {
  const gridRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const lastAnimatedKeyRef = useRef<string | null>(null);

  useGSAP(
    () => {
      if (!enabled || !gridRef.current || reducedMotion) return;
      if (lastAnimatedKeyRef.current === itemsKey) return;

      const cards = gridRef.current.querySelectorAll('[data-library-card]');
      if (cards.length === 0) return;

      lastAnimatedKeyRef.current = itemsKey;
      gridStaggerReveal(cards, { reducedMotion });
    },
    { scope: gridRef, dependencies: [itemsKey, enabled, reducedMotion] },
  );

  return gridRef;
}
