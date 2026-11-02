import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface CommandPaletteMotionOptions extends gsap.TimelineVars {
  reducedMotion?: boolean;
}

export function commandPaletteEnter(
  backdrop: gsap.TweenTarget,
  panel: gsap.TweenTarget,
  vars?: CommandPaletteMotionOptions,
): gsap.core.Timeline {
  const { reducedMotion = false, ...timelineVars } = vars ?? {};

  if (reducedMotion) {
    gsap.set(backdrop, { autoAlpha: 1 });
    gsap.set(panel, { autoAlpha: 1, y: 0, scale: 1 });
    return gsap.timeline(timelineVars);
  }

  gsap.set(backdrop, { autoAlpha: 0 });
  gsap.set(panel, { autoAlpha: 0, y: -8, scale: 0.98 });

  const timeline = gsap.timeline(timelineVars);
  timeline
    .to(backdrop, {
      autoAlpha: 1,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
    })
    .to(
      panel,
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: DURATION.standard / 1000,
        ease: EASING.emphasizedOut,
      },
      '-=0.04',
    );
  return timeline;
}

export function commandPaletteExit(
  backdrop: gsap.TweenTarget,
  panel: gsap.TweenTarget,
  vars?: CommandPaletteMotionOptions,
): gsap.core.Timeline {
  const { reducedMotion = false, ...timelineVars } = vars ?? {};

  if (reducedMotion) {
    gsap.set(backdrop, { autoAlpha: 0 });
    gsap.set(panel, { autoAlpha: 0, y: -8, scale: 0.98 });
    return gsap.timeline(timelineVars);
  }

  const timeline = gsap.timeline(timelineVars);
  timeline
    .to(panel, {
      autoAlpha: 0,
      y: -8,
      scale: 0.98,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
    })
    .to(
      backdrop,
      {
        autoAlpha: 0,
        duration: DURATION.quick / 1000,
        ease: EASING.standardOut,
      },
      '-=0.06',
    );
  return timeline;
}
