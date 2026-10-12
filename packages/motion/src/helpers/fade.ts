import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface FadeOptions extends gsap.TweenVars {
  reducedMotion?: boolean;
}

export function fadeIn(
  target: gsap.TweenTarget,
  vars?: FadeOptions,
): gsap.core.Tween {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, { autoAlpha: 1 });
  }

  return gsap.fromTo(
    target,
    { autoAlpha: 0 },
    {
      autoAlpha: 1,
      duration: DURATION.standard / 1000,
      ease: EASING.standardOut,
      ...tweenVars,
    },
  );
}

export function fadeOut(
  target: gsap.TweenTarget,
  vars?: FadeOptions,
): gsap.core.Tween {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, { autoAlpha: 0 });
  }

  return gsap.to(target, {
    autoAlpha: 0,
    duration: DURATION.quick / 1000,
    ease: EASING.standardOut,
    ...tweenVars,
  });
}
