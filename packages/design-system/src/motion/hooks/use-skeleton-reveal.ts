import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { skeletonReveal } from '../shell/skeleton-reveal.js';
import { useReducedMotion } from './use-reduced-motion.js';

/**
 * Fades the returned ref's element in when `loading` turns false, so content replacing a
 * skeleton does not pop. Content that was ready on the first render (a warm cache) shows as it is.
 * Put the hook in the component that stays mounted across the swap.
 */
export function useSkeletonReveal<T extends HTMLElement = HTMLDivElement>(loading: boolean) {
  const ref = useRef<T>(null);
  const reducedMotion = useReducedMotion();
  const wasLoading = useRef(loading);

  useGSAP(
    () => {
      const replacedSkeleton = wasLoading.current && !loading;
      wasLoading.current = loading;
      if (replacedSkeleton && ref.current !== null) skeletonReveal(ref.current, { reducedMotion });
    },
    { scope: ref, dependencies: [loading, reducedMotion] },
  );

  return ref;
}
