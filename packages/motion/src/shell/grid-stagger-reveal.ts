import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface GridStaggerRevealOptions extends gsap.TweenVars {
  reducedMotion?: boolean;
}

export function gridStaggerReveal(
  target: gsap.TweenTarget,
  vars?: GridStaggerRevealOptions,
): gsap.core.Tween | gsap.core.Tween[] {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, { y: 0, autoAlpha: 1 });
  }

  return gsap.fromTo(
    target,
    { y: 12, autoAlpha: 0 },
    {
      y: 0,
      autoAlpha: 1,
      duration: DURATION.standard / 1000,
      ease: EASING.softEntrance,
      stagger: DURATION.micro / 1000,
      ...tweenVars,
    },
  );
}
