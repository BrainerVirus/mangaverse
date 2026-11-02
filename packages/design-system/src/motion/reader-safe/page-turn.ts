import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface PageTurnOptions extends gsap.TweenVars {
  reducedMotion?: boolean;
}

export function pageTurn(
  target: gsap.TweenTarget,
  direction: 'forward' | 'backward' = 'forward',
  vars?: PageTurnOptions,
): gsap.core.Tween {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, {
      xPercent: direction === 'forward' ? -100 : 100,
      autoAlpha: 0,
    });
  }

  return gsap.fromTo(
    target,
    { xPercent: 0, opacity: 1 },
    {
      xPercent: direction === 'forward' ? -100 : 100,
      opacity: 0,
      duration: DURATION.cinematic / 1000,
      ease: EASING.standardInOut,
      ...tweenVars,
    },
  );
}
