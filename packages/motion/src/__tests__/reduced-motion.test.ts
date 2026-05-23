import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gsap } from 'gsap';
import { fadeIn, fadeOut } from '../helpers/fade.js';
import { slideUp, slideDown } from '../helpers/slide.js';
import { scaleIn } from '../helpers/scale.js';
import { staggerIn } from '../helpers/stagger.js';

vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn(() => ({ then: vi.fn() })),
    to: vi.fn(() => ({ then: vi.fn() })),
    set: vi.fn(() => ({ then: vi.fn() })),
  },
}));

let mockReducedMotion = true;

vi.mock('react', () => ({
  useState: vi.fn((init) => {
    const [value, setter] = [mockReducedMotion, vi.fn((v) => { mockReducedMotion = v; })];
    return [value, setter];
  }),
  useEffect: vi.fn((callback) => {
    callback();
  }),
}));

const mockMatchMedia = (matches: boolean) => {
  return {
    get matches() { return matches; },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
};

describe('reduced motion behavior', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    mockReducedMotion = true;
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn(() => mockMatchMedia(true)),
      writable: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
    });
  });

  it('fadeIn should use gsap.set (instant) when reduced motion is active', () => {
    fadeIn('.element');
    expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 1 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('fadeOut should use gsap.set (instant) when reduced motion is active', () => {
    fadeOut('.element');
    expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 0 });
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('slideUp should use gsap.set (instant) when reduced motion is active', () => {
    slideUp('.element');
    expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('slideDown should use gsap.set (instant) when reduced motion is active', () => {
    slideDown('.element');
    expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0 });
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('scaleIn should use gsap.set (instant) when reduced motion is active', () => {
    scaleIn('.element');
    expect(gsap.set).toHaveBeenCalledWith('.element', { scale: 1, opacity: 1 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('staggerIn should use gsap.set (instant) when reduced motion is active', () => {
    staggerIn('.element');
    expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0, opacity: 1 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });
});