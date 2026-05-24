import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface StaggerInOptions extends gsap.TweenVars {
  reducedMotion?: boolean;
}

export function staggerIn(
  target: gsap.TweenTarget,
  vars?: StaggerInOptions,
): gsap.core.Tween | gsap.core.Tween[] {
  const { reducedMotion = false, ...tweenVars } = vars ?? {};

  if (reducedMotion) {
    return gsap.set(target, { y: 0, opacity: 1 });
  }

  return gsap.fromTo(
    target,
    { y: 16, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: DURATION.standard / 1000,
      ease: EASING.standardOut,
      stagger: DURATION.micro / 1000,
      ...tweenVars,
    },
  );
}