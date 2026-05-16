import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function slideUp(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

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
      ...vars,
    }
  );
}

export function slideDown(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return gsap.set(target, { y: 0 });
  }

  return gsap.to(target, {
    y: 20,
    autoAlpha: 0,
    duration: DURATION.quick / 1000,
    ease: EASING.standardOut,
    ...vars,
  });
}