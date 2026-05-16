import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function staggerIn(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

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
      ...vars,
    }
  );
}