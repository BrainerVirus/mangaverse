import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface SkeletonRevealOptions {
  reducedMotion?: boolean;
}

/**
 * Content that replaces its skeleton fades up from half-drawn: never from nothing, so the swap
 * has no empty frame, and quickly, so it reads as the page settling rather than an effect.
 * Reduced motion shows it at once.
 */
export function skeletonReveal(
  target: gsap.TweenTarget,
  { reducedMotion = false }: SkeletonRevealOptions = {},
): gsap.core.Tween | null {
  if (reducedMotion) return null;
  return gsap.fromTo(
    target,
    { opacity: 0.5 },
    {
      opacity: 1,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
      clearProps: 'opacity',
    },
  );
}
