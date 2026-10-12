/**
 * Reads prefers-reduced-motion synchronously for GSAP callbacks and other
 * non-React contexts. Components should prefer `useReducedMotion()` at the
 * top level and pass `reducedMotion` into motion helpers.
 */
export function getReducedMotionPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
