import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { fadeIn, fadeOut } from '../helpers/fade.js';
import { slideUp, slideDown } from '../helpers/slide.js';
import { scaleIn } from '../helpers/scale.js';
import { staggerIn } from '../helpers/stagger.js';
import { createTimeline } from '../helpers/timeline.js';

vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn(() => ({ then: vi.fn() })),
    to: vi.fn(() => ({ then: vi.fn() })),
    set: vi.fn(() => ({ then: vi.fn() })),
    timeline: vi.fn(() => ({
      fromTo: vi.fn().mockReturnThis(),
      to: vi.fn().mockReturnThis(),
    })),
  },
}));

describe('motion helpers - gsap integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with reduced motion OFF', () => {
    it('fadeIn should call gsap.fromTo with correct properties', () => {
      fadeIn('.element', { reducedMotion: false });
      expect(gsap.fromTo).toHaveBeenCalledWith(
        '.element',
        { autoAlpha: 0 },
        expect.objectContaining({
          autoAlpha: 1,
          duration: 0.22,
          ease: 'power2.out',
        }),
      );
    });

    it('fadeOut should call gsap.to with correct properties', () => {
      fadeOut('.element', { reducedMotion: false });
      expect(gsap.to).toHaveBeenCalledWith(
        '.element',
        expect.objectContaining({
          autoAlpha: 0,
          duration: 0.14,
          ease: 'power2.out',
        }),
      );
    });

    it('slideUp should call gsap.fromTo with correct properties', () => {
      slideUp('.element', { reducedMotion: false });
      expect(gsap.fromTo).toHaveBeenCalledWith(
        '.element',
        { y: 20, autoAlpha: 0 },
        expect.objectContaining({
          y: 0,
          autoAlpha: 1,
          duration: 0.22,
          ease: 'power2.out',
        }),
      );
    });

    it('slideDown should call gsap.to with correct properties', () => {
      slideDown('.element', { reducedMotion: false });
      expect(gsap.to).toHaveBeenCalledWith(
        '.element',
        expect.objectContaining({
          y: 20,
          autoAlpha: 0,
          duration: 0.14,
          ease: 'power2.out',
        }),
      );
    });

    it('scaleIn should call gsap.fromTo with correct properties', () => {
      scaleIn('.element', { reducedMotion: false });
      expect(gsap.fromTo).toHaveBeenCalledWith(
        '.element',
        { scale: 0.9, opacity: 0 },
        expect.objectContaining({
          scale: 1,
          opacity: 1,
          duration: 0.22,
          ease: 'expo.out',
        }),
      );
    });

    it('staggerIn should call gsap.fromTo with correct stagger properties', () => {
      staggerIn('.element', { reducedMotion: false });
      expect(gsap.fromTo).toHaveBeenCalledWith(
        '.element',
        { y: 16, opacity: 0 },
        expect.objectContaining({
          y: 0,
          opacity: 1,
          duration: 0.22,
          ease: 'power2.out',
          stagger: 0.09,
        }),
      );
    });
  });

  describe('with reduced motion ON', () => {
    it('fadeIn should use gsap.set (instant transition)', () => {
      fadeIn('.element', { reducedMotion: true });
      expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 1 });
      expect(gsap.fromTo).not.toHaveBeenCalled();
    });

    it('fadeOut should use gsap.set (instant transition)', () => {
      fadeOut('.element', { reducedMotion: true });
      expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 0 });
      expect(gsap.to).not.toHaveBeenCalled();
    });

    it('slideUp should use gsap.set (instant transition)', () => {
      slideUp('.element', { reducedMotion: true });
      expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0 });
      expect(gsap.fromTo).not.toHaveBeenCalled();
    });

    it('slideDown should use gsap.set (instant transition)', () => {
      slideDown('.element', { reducedMotion: true });
      expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0 });
      expect(gsap.to).not.toHaveBeenCalled();
    });

    it('scaleIn should use gsap.set (instant transition)', () => {
      scaleIn('.element', { reducedMotion: true });
      expect(gsap.set).toHaveBeenCalledWith('.element', { scale: 1, opacity: 1 });
      expect(gsap.fromTo).not.toHaveBeenCalled();
    });

    it('staggerIn should use gsap.set (instant transition)', () => {
      staggerIn('.element', { reducedMotion: true });
      expect(gsap.set).toHaveBeenCalledWith('.element', { y: 0, opacity: 1 });
      expect(gsap.fromTo).not.toHaveBeenCalled();
    });
  });
});

describe('createTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call gsap.timeline', () => {
    createTimeline();
    expect(gsap.timeline).toHaveBeenCalled();
  });

  it('should return a timeline instance', () => {
    const tl = createTimeline();
    expect(tl).toBeDefined();
  });
});
