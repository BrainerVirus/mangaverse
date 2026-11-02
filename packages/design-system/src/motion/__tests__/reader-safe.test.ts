import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { chromeShow, chromeHide } from '../reader-safe/chrome.js';
import { pageTurn } from '../reader-safe/page-turn.js';
import { readerModePill } from '../reader-safe/mode-pill.js';
import { settingsDrawerTransition } from '../reader-safe/settings-drawer.js';
import { readerPageEnter } from '../reader-safe/page-enter.js';

vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn<(target: unknown, vars: unknown) => unknown>(() => ({
      then: vi.fn<() => void>(),
    })),
    to: vi.fn<(target: unknown, vars: unknown) => unknown>(() => ({ then: vi.fn<() => void>() })),
    set: vi.fn<(target: unknown, vars: unknown) => unknown>(() => ({ then: vi.fn<() => void>() })),
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

describe('readerPageEnter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Given a fade transition, When a page enters, Then only its own opacity animates', () => {
    readerPageEnter('.page-layer', 'fade', { reducedMotion: false });

    expect(gsap.fromTo).toHaveBeenCalledWith(
      '.page-layer',
      { opacity: 0 },
      expect.objectContaining({ opacity: 1, duration: 0.14 }),
    );
  });

  it('Given a slide transition, When moving forward, Then the page enters from the right in LTR', () => {
    readerPageEnter('.page-layer', 'slide', {
      reducedMotion: false,
      direction: 'forward',
      rtl: false,
    });
    expect(gsap.fromTo).toHaveBeenCalledWith(
      '.page-layer',
      { xPercent: 6, opacity: 0.4 },
      expect.objectContaining({ xPercent: 0, opacity: 1 }),
    );
  });

  it('Given a slide transition, When moving forward in RTL, Then the entering side flips', () => {
    readerPageEnter('.page-layer', 'slide', {
      reducedMotion: false,
      direction: 'forward',
      rtl: true,
    });
    expect(gsap.fromTo).toHaveBeenCalledWith(
      '.page-layer',
      { xPercent: -6, opacity: 0.4 },
      expect.anything(),
    );
  });

  it('Given reduced motion or no transition, When a page enters, Then it snaps without a tween', () => {
    readerPageEnter('.page-layer', 'slide', { reducedMotion: true });
    readerPageEnter('.page-layer', 'none', { reducedMotion: false });
    expect(gsap.fromTo).not.toHaveBeenCalled();
    expect(gsap.set).toHaveBeenCalledTimes(2);
  });
});

describe('readerModePill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('morphs with the documented duration and easing', () => {
    readerModePill('.pill', { x: 24, width: 80, reducedMotion: false });

    expect(gsap.to).toHaveBeenCalledWith(
      '.pill',
      expect.objectContaining({
        x: 24,
        width: 80,
        autoAlpha: 1,
        duration: 0.28,
        ease: 'power3.out',
      }),
    );
  });

  it('snaps to the active option for reduced motion', () => {
    readerModePill('.pill', { x: 24, width: 80, reducedMotion: true });

    expect(gsap.set).toHaveBeenCalledWith('.pill', { x: 24, width: 80, autoAlpha: 1 });
    expect(gsap.to).not.toHaveBeenCalled();
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
