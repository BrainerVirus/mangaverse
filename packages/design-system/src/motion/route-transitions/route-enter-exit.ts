import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export type RouteTransitionVariant = 'default' | 'reader';

export interface RouteTransitionOptions extends gsap.TimelineVars {
  reducedMotion?: boolean;
  variant?: RouteTransitionVariant;
}

/**
 * A page that has arrived settles in from almost fully drawn: it is never hidden, so a navigation
 * can never show an empty frame. The reader does not move at all.
 */
const ENTER_FROM_OPACITY = 0.85;
/** Inline styles the enter leaves behind; a leftover transform would trap fixed descendants. */
const ENTER_PROPS = 'opacity,visibility,transform';

function getRouteMotion(variant: RouteTransitionVariant) {
  if (variant === 'reader') {
    return {
      enterDuration: DURATION.quick,
      exitDuration: DURATION.micro,
      enterOffset: 0,
      exitOffset: -4,
    };
  }

  return {
    enterDuration: DURATION.quick,
    exitDuration: DURATION.quick,
    enterOffset: 4,
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
    gsap.set(target, { clearProps: ENTER_PROPS });
    return gsap.timeline(timelineVars);
  }

  const timeline = gsap.timeline(timelineVars);
  timeline.fromTo(
    target,
    { opacity: ENTER_FROM_OPACITY, y: motion.enterOffset },
    {
      opacity: 1,
      y: 0,
      duration: motion.enterDuration / 1000,
      ease: EASING.standardOut,
      clearProps: ENTER_PROPS,
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
