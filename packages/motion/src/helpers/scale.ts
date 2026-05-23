import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function scaleIn(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

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
      ...vars,
    }
  );
}