import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function fadeIn(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

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
      ...vars,
    }
  );
}

export function fadeOut(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return gsap.set(target, { autoAlpha: 0 });
  }

  return gsap.to(target, {
    autoAlpha: 0,
    duration: DURATION.quick / 1000,
    ease: EASING.standardOut,
    ...vars,
  });
}