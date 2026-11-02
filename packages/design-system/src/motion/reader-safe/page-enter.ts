import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export type ReaderPageTransition = 'none' | 'fade' | 'slide';

export interface ReaderPageEnterOptions {
  readonly reducedMotion?: boolean;
  readonly direction?: 'forward' | 'backward';
  readonly rtl?: boolean;
}

/**
 * The incoming page layer's entrance. Only the page layer moves: chrome, tap
 * zones and the zoom box keep their geometry, and the caller's GSAP context
 * reverts this tween before the next page turn starts.
 */
export function readerPageEnter(
  target: gsap.TweenTarget,
  mode: ReaderPageTransition,
  options: ReaderPageEnterOptions = {},
): gsap.core.Tween | null {
  const { reducedMotion = false, direction = 'forward', rtl = false } = options;
  if (mode === 'none' || reducedMotion) {
    return gsap.set(target, { opacity: 1, xPercent: 0, clearProps: 'transform' });
  }

  if (mode === 'fade') {
    return gsap.fromTo(
      target,
      { opacity: 0 },
      { opacity: 1, duration: DURATION.quick / 1000, ease: EASING.softEntrance },
    );
  }

  // Reading forward brings the next page in from the side the reading direction
  // leaves behind; backward reverses it.
  const enterFrom = (direction === 'forward' ? 1 : -1) * (rtl ? -1 : 1) * 6;
  return gsap.fromTo(
    target,
    { xPercent: enterFrom, opacity: 0.4 },
    {
      xPercent: 0,
      opacity: 1,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
    },
  );
}
