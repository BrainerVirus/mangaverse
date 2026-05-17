import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

interface RouteTransitionOptions extends gsap.TimelineVars {
  reducedMotion?: boolean;
}

export function routeEnter(
  target: gsap.TweenTarget,
  vars?: RouteTransitionOptions,
): gsap.core.Timeline {
  const { reducedMotion = false, ...timelineVars } = vars ?? {};

  if (reducedMotion) {
    gsap.set(target, { opacity: 1, y: 0 });
    return gsap.timeline(timelineVars);
  }

  const timeline = gsap.timeline(timelineVars);
  timeline.fromTo(
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
  vars?: RouteTransitionOptions,
): gsap.core.Timeline {
  const { reducedMotion = false, ...timelineVars } = vars ?? {};

  if (reducedMotion) {
    gsap.set(target, { opacity: 0, y: -8 });
    return gsap.timeline(timelineVars);
  }

  const timeline = gsap.timeline(timelineVars);
  timeline.to(target, {
    opacity: 0,
    y: -8,
    duration: DURATION.quick / 1000,
    ease: EASING.standardOut,
  });
  return timeline;
}