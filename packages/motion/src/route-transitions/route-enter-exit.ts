import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export type RouteTransitionVariant = 'default' | 'reader';

export interface RouteTransitionOptions extends gsap.TimelineVars {
  reducedMotion?: boolean;
  variant?: RouteTransitionVariant;
}

function getRouteMotion(variant: RouteTransitionVariant) {
  if (variant === 'reader') {
    return {
      enterDuration: DURATION.quick,
      exitDuration: DURATION.micro,
      enterOffset: 4,
      exitOffset: -4,
    };
  }

  return {
    enterDuration: DURATION.standard,
    exitDuration: DURATION.quick,
    enterOffset: 8,
    exitOffset: -8,
  };
}

export function routeEnter(
  target: gsap.TweenTarget,
  vars?: RouteTransitionOptions,
): gsap.core.Timeline {
  const { reducedMotion = false, variant = 'default', ...timelineVars } = vars ?? {};
  const motion = getRouteMotion(variant);

  if (reducedMotion) {
    gsap.set(target, { autoAlpha: 1, y: 0 });
    return gsap.timeline(timelineVars);
  }

  const timeline = gsap.timeline(timelineVars);
  timeline.fromTo(
    target,
    { autoAlpha: 0, y: motion.enterOffset },
    {
      autoAlpha: 1,
      y: 0,
      duration: motion.enterDuration / 1000,
      ease: EASING.standardOut,
    },
  );
  return timeline;
}

export function routeExit(
  target: gsap.TweenTarget,
  vars?: RouteTransitionOptions,
): gsap.core.Timeline {
  const { reducedMotion = false, variant = 'default', ...timelineVars } = vars ?? {};
  const motion = getRouteMotion(variant);

  if (reducedMotion) {
    gsap.set(target, { autoAlpha: 0, y: motion.exitOffset });
    return gsap.timeline(timelineVars);
  }

  const timeline = gsap.timeline(timelineVars);
  timeline.to(target, {
    autoAlpha: 0,
    y: motion.exitOffset,
    duration: motion.exitDuration / 1000,
    ease: EASING.standardOut,
  });
  return timeline;
}