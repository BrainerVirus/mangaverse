import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function pageTurn(
  target: gsap.TweenTarget,
  direction: 'forward' | 'backward' = 'forward',
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

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
      ...vars,
    }
  );
}