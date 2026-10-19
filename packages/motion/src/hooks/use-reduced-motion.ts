import { useSyncExternalStore } from 'react';
import {
  getReducedMotionPreference,
  subscribeToInAppReducedMotionPreference,
} from '../utils/reduced-motion-preference.js';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * React subscribes to both external preference sources directly; the SSR
 * snapshot is false without a post-paint setState round trip.
 */
function subscribeReducedMotion(onChange: () => void): () => void {
  const unsubscribeInApp = subscribeToInAppReducedMotionPreference(onChange);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return unsubscribeInApp;
  }

  const mediaQuery = window.matchMedia(QUERY);
  mediaQuery.addEventListener('change', onChange);
  return () => {
    unsubscribeInApp();
    mediaQuery.removeEventListener('change', onChange);
  };
}

function readReducedMotion(): boolean {
  return getReducedMotionPreference();
}

function readServerReducedMotion(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readServerReducedMotion);
}
