import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface ReaderModePillOptions {
  readonly x: number;
  readonly width: number;
  readonly reducedMotion?: boolean;
}

export function readerModePill(
  target: gsap.TweenTarget,
  { x, width, reducedMotion = false }: ReaderModePillOptions,
): gsap.core.Tween {
  const endState = { x, width, autoAlpha: 1 };
  if (reducedMotion) return gsap.set(target, endState);

  return gsap.to(target, {
    ...endState,
    duration: DURATION.readerModePill / 1000,
    ease: EASING.readerModePill,
  });
}
