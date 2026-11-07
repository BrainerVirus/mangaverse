import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

export interface CardHoverOptions {
  reducedMotion?: boolean;
}

const HOVER_MEDIA = '(hover: hover) and (pointer: fine)';

/**
 * Hover-only lift for content cards. Focus never animates (DESIGN.md §5), the media query keeps
 * touch devices still, and the duration/ease come from the tokens instead of a literal in the
 * component.
 */
export function cardHover(
  target: HTMLElement,
  { reducedMotion = false }: CardHoverOptions = {},
): () => void {
  if (
    reducedMotion ||
    typeof window.matchMedia !== 'function' ||
    !window.matchMedia(HOVER_MEDIA).matches
  ) {
    return () => {};
  }

  const enter = (): void => {
    gsap.to(target, {
      y: -2,
      scale: 1.02,
      duration: DURATION.quick / 1000,
      ease: EASING.standardOut,
    });
  };
  const leave = (): void => {
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
