import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface SlideOptions extends gsap.TweenVars {
  reducedMotion?: boolean;
}

export function slideUp(
  target: gsap.TweenTarget,
  vars?: SlideOptions,
): gsap.core.Tween {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, { y: 0 });
  }

  return gsap.fromTo(
    target,
    { y: 20, autoAlpha: 0 },
    {
      y: 0,
      autoAlpha: 1,
      duration: DURATION.standard / 1000,
      ease: EASING.standardOut,
      ...tweenVars,
    },
  );
}

export function slideDown(
  target: gsap.TweenTarget,
  vars?: SlideOptions,
): gsap.core.Tween {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, { y: 0 });
  }

  return gsap.to(target, {
    y: 20,
    autoAlpha: 0,
    duration: DURATION.quick / 1000,
    ease: EASING.standardOut,
    ...tweenVars,
  });
}
