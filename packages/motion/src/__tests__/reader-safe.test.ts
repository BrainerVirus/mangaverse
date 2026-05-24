import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { chromeShow, chromeHide } from '../reader-safe/chrome.js';
import { pageTurn } from '../reader-safe/page-turn.js';
import { settingsDrawerTransition } from '../reader-safe/settings-drawer.js';

vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn(() => ({ then: vi.fn() })),
    to: vi.fn(() => ({ then: vi.fn() })),
    set: vi.fn(() => ({ then: vi.fn() })),
  },
}));

describe('chromeShow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call gsap.fromTo with correct properties', () => {
    const target = '.element';
    chromeShow(target, { reducedMotion: false });

    expect(gsap.fromTo).toHaveBeenCalledWith(
      target,
      { opacity: 0, y: -8 },
      expect.objectContaining({
        opacity: 1,
        y: 0,
        duration: 0.14,
        ease: 'power1.out',
      }),
    );
  });

  it('should snap to visible state when reduced motion is enabled', () => {
    chromeShow('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 1, y: 0 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });
});

describe('chromeHide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call gsap.to with correct properties', () => {
    const target = '.element';
    chromeHide(target, { reducedMotion: false });

    expect(gsap.to).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        opacity: 0,
        y: -8,
        duration: 0.09,
        ease: 'power2.out',
      }),
    );
  });

  it('should snap to hidden state when reduced motion is enabled', () => {
    chromeHide('.element', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.element', { autoAlpha: 0, y: -8 });
    expect(gsap.to).not.toHaveBeenCalled();
  });
});

describe('pageTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call gsap.fromTo with forward direction', () => {
    const target = '.element';
    pageTurn(target, 'forward', { reducedMotion: false });

    expect(gsap.fromTo).toHaveBeenCalledWith(
      target,
      { xPercent: 0, opacity: 1 },
      expect.objectContaining({
        xPercent: -100,
        opacity: 0,
        duration: 0.52,
        ease: 'power3.inOut',
      }),
    );
  });

  it('should call gsap.fromTo with backward direction', () => {
    const target = '.element';
    pageTurn(target, 'backward', { reducedMotion: false });

    expect(gsap.fromTo).toHaveBeenCalledWith(
      target,
      { xPercent: 0, opacity: 1 },
      expect.objectContaining({
        xPercent: 100,
        opacity: 0,
        duration: 0.52,
        ease: 'power3.inOut',
      }),
    );
  });
});

describe('settingsDrawerTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call gsap.fromTo with open action', () => {
    const target = '.element';
    settingsDrawerTransition(target, 'open', { reducedMotion: false });

    expect(gsap.fromTo).toHaveBeenCalledWith(
      target,
      { x: '100%', opacity: 0 },
      expect.objectContaining({
        x: '0%',
        opacity: 1,
        duration: 0.36,
        ease: 'expo.out',
      }),
    );
  });

  it('should call gsap.to with close action', () => {
    const target = '.element';
    settingsDrawerTransition(target, 'close', { reducedMotion: false });

    expect(gsap.to).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        x: '100%',
        opacity: 0,
        duration: 0.22,
        ease: 'power2.out',
      }),
    );
  });
});
