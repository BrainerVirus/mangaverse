import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface ScaleOptions extends gsap.TweenVars {
  reducedMotion?: boolean;
}

export function scaleIn(
  target: gsap.TweenTarget,
  vars?: ScaleOptions,
): gsap.core.Tween {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, { scale: 1, opacity: 1 });
  }

  return gsap.fromTo(
    target,
    { scale: 0.9, opacity: 0 },
    {
      scale: 1,
      opacity: 1,
      duration: DURATION.standard / 1000,
      ease: EASING.emphasizedOut,
      ...tweenVars,
    },
  );
}
