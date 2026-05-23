import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function chromeShow(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return gsap.set(target, { autoAlpha: 1, y: 0 });
  }

  return gsap.fromTo(
    target,
    { opacity: 0, y: -8 },
    {
      opacity: 1,
      y: 0,
      duration: DURATION.quick / 1000,
      ease: EASING.softEntrance,
      ...vars,
    }
  );
}

export function chromeHide(
  target: gsap.TweenTarget,
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return gsap.set(target, { autoAlpha: 0, y: -8 });
  }

  return gsap.to(target, {
    opacity: 0,
    y: -8,
    duration: DURATION.micro / 1000,
    ease: EASING.standardOut,
    ...vars,
  });
}