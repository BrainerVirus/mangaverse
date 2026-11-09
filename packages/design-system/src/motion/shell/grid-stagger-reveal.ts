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
    // A reveal already in flight would keep stepping toward its end state; stop it here instead.
    gsap.killTweensOf(target);
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
      // A new result set can arrive mid-reveal: the older tween on the same cards must not fight it.
      overwrite: 'auto',
      ...tweenVars,
    },
  );
}
