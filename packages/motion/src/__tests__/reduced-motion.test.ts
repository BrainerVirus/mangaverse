import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('reduced motion behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fadeIn should use gsap.set (instant) when reduced motion is active', () => {
    fadeIn('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 1 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('fadeOut should use gsap.set (instant) when reduced motion is active', () => {
    fadeOut('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 0 });
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('slideUp should use gsap.set (instant) when reduced motion is active', () => {
    slideUp('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('slideDown should use gsap.set (instant) when reduced motion is active', () => {
    slideDown('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0 });
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('scaleIn should use gsap.set (instant) when reduced motion is active', () => {
    scaleIn('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { scale: 1, opacity: 1 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('staggerIn should use gsap.set (instant) when reduced motion is active', () => {
    staggerIn('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0, opacity: 1 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });
});
