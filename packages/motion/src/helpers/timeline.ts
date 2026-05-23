import { gsap } from 'gsap';

export function createTimeline(vars?: gsap.TimelineVars): gsap.core.Timeline {
  return gsap.timeline(vars);
}