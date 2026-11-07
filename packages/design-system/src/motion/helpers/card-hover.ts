import { gsap } from 'gsap';
import { getReducedMotionPreference } from '../utils/reduced-motion-preference.js';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

const HOVER_MEDIA = '(hover: hover) and (pointer: fine)';

/**
 * Hover-only lift for content cards. The preference is read on every event, not captured at
 * mount: enabling reduced motion after the card rendered must stop the next hover, and the
 * leave path still resets the transform. Focus never animates (DESIGN.md §5).
 */
export function cardHover(target: HTMLElement): () => void {
  if (typeof window.matchMedia !== 'function' || !window.matchMedia(HOVER_MEDIA).matches) {
    return () => {};
  }

  const enter = (): void => {
    if (getReducedMotionPreference() || !window.matchMedia(HOVER_MEDIA).matches) {
      // A card lifted before the preference changed must not stay lifted on the next hover.
      gsap.set(target, { y: 0, scale: 1 });
      return;
    }
    gsap.to(target, {
      y: -2,
      scale: 1.02,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
    });
  };
  const leave = (): void => {
    if (getReducedMotionPreference()) {
      gsap.set(target, { y: 0, scale: 1 });
      return;
    }
    gsap.to(target, {
      y: 0,
      scale: 1,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
    });
  };

  target.addEventListener('mouseenter', enter);
  target.addEventListener('mouseleave', leave);
  return () => {
    target.removeEventListener('mouseenter', enter);
    target.removeEventListener('mouseleave', leave);
  };
}
