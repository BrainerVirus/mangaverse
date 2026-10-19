let inAppReducedMotionPreference = false;
const listeners = new Set<() => void>();

export function setInAppReducedMotionPreference(reduced: boolean): void {
  if (inAppReducedMotionPreference === reduced) return;
  inAppReducedMotionPreference = reduced;
  for (const listener of listeners) listener();
}

export function subscribeToInAppReducedMotionPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reads the in-app and OS preferences synchronously for GSAP callbacks and
 * other non-React contexts. Components should prefer `useReducedMotion()`.
 */
export function getReducedMotionPreference(): boolean {
  if (inAppReducedMotionPreference) return true;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
