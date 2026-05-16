import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';
import { useReducedMotion } from '../hooks/use-reduced-motion.js';

export function settingsDrawerTransition(
  target: gsap.TweenTarget,
  action: 'open' | 'close' = 'open',
  vars?: gsap.TweenVars
): gsap.core.Tween {
  const reducedMotion = useReducedMotion();

  if (action === 'open') {
    if (reducedMotion) {
      return gsap.set(target, { x: '0%', autoAlpha: 1 });
    }

    return gsap.fromTo(
      target,
      { x: '100%', opacity: 0 },
      {
        x: '0%',
        opacity: 1,
        duration: DURATION.expressive / 1000,
        ease: EASING.emphasizedOut,
        ...vars,
      }
    );
  }

  if (reducedMotion) {
    return gsap.set(target, { x: '100%', autoAlpha: 0 });
  }

  return gsap.to(target, {
    x: '100%',
    opacity: 0,
    duration: DURATION.standard / 1000,
    ease: EASING.standardOut,
    ...vars,
  });
}