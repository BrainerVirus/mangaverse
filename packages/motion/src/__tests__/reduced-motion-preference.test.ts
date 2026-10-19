import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getReducedMotionPreference } from '../utils/reduced-motion-preference.js';
import { setInAppReducedMotionPreference } from '../utils/reduced-motion-preference.js';

describe('getReducedMotionPreference', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    setInAppReducedMotionPreference(false);
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
    });
  });

  it('returns false when prefers-reduced-motion is not active', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn<() => { matches: boolean }>(() => ({ matches: false })),
      writable: true,
    });

    expect(getReducedMotionPreference()).toBe(false);
  });

  it('returns true when prefers-reduced-motion is active', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn<() => { matches: boolean }>(() => ({ matches: true })),
      writable: true,
    });

    expect(getReducedMotionPreference()).toBe(true);
  });

  it('returns true when the in-app preference requests reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn<() => { matches: boolean }>(() => ({ matches: false })),
      writable: true,
    });
    setInAppReducedMotionPreference(true);

    expect(getReducedMotionPreference()).toBe(true);
  });
});
