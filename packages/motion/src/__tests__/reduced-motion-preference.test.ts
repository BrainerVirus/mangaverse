import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getReducedMotionPreference } from '../utils/reduced-motion-preference.js';

describe('getReducedMotionPreference', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
    });
  });

  it('returns false when prefers-reduced-motion is not active', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn(() => ({ matches: false })),
      writable: true,
    });

    expect(getReducedMotionPreference()).toBe(false);
  });

  it('returns true when prefers-reduced-motion is active', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn(() => ({ matches: true })),
      writable: true,
    });

    expect(getReducedMotionPreference()).toBe(true);
  });
});
