import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function routeEnter(
  target: gsap.TweenTarget,
  vars?: gsap.TimelineVars
): gsap.core.Timeline {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    gsap.set(target, { opacity: 1, y: 0 });
    return gsap.timeline(vars);
  }

  const timeline = gsap.timeline(vars);

  timeline
    .fromTo(
      target,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: DURATION.standard / 1000,
        ease: EASING.standardOut,
      }
    );

  return timeline;
}

export function routeExit(
  target: gsap.TweenTarget,
  vars?: gsap.TimelineVars
): gsap.core.Timeline {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    gsap.set(target, { opacity: 0, y: -8 });
    return gsap.timeline(vars);
  }

  const timeline = gsap.timeline(vars);

  timeline
    .to(target, {
      opacity: 0,
      y: -8,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
    });

  return timeline;
}