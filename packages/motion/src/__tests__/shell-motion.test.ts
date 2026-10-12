import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
import { commandPaletteEnter, commandPaletteExit } from '../shell/command-palette.js';
import { gridStaggerReveal } from '../shell/grid-stagger-reveal.js';
import { routeEnter, routeExit } from '../route-transitions/route-enter-exit.js';

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

describe('shell motion helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('commandPaletteEnter animates backdrop and panel when motion is enabled', () => {
    commandPaletteEnter('.backdrop', '.panel', { reducedMotion: false });
    expect(gsap.set).toHaveBeenCalled();
    expect(gsap.timeline).toHaveBeenCalled();
  });

  it('commandPaletteEnter snaps to final state when reduced motion is enabled', () => {
    commandPaletteEnter('.backdrop', '.panel', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.backdrop', { autoAlpha: 1 });
    expect(gsap.set).toHaveBeenCalledWith('.panel', { autoAlpha: 1, y: 0, scale: 1 });
  });

  it('commandPaletteExit snaps to hidden state when reduced motion is enabled', () => {
    commandPaletteExit('.backdrop', '.panel', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.backdrop', { autoAlpha: 0 });
    expect(gsap.set).toHaveBeenCalledWith('.panel', { autoAlpha: 0, y: -8, scale: 0.98 });
  });

  it('gridStaggerReveal uses gsap.set when reduced motion is enabled', () => {
    gridStaggerReveal('.cards', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.cards', { y: 0, autoAlpha: 1 });
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('gridStaggerReveal staggers cards when motion is enabled', () => {
    gridStaggerReveal('.cards', { reducedMotion: false });
    expect(gsap.fromTo).toHaveBeenCalledWith(
      '.cards',
      { y: 12, autoAlpha: 0 },
      expect.objectContaining({
        y: 0,
        autoAlpha: 1,
        duration: 0.22,
        ease: 'power1.out',
        stagger: 0.09,
      }),
    );
  });
});

describe('route transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routeEnter uses quicker motion for reader routes', () => {
    routeEnter('.route', { reducedMotion: false, variant: 'reader' });
    expect(gsap.timeline).toHaveBeenCalled();
  });

  it('routeEnter snaps to visible state when reduced motion is enabled', () => {
    routeEnter('.route', { reducedMotion: true });
    expect(gsap.set).toHaveBeenCalledWith('.route', { autoAlpha: 1, y: 0 });
  });

  it('routeExit snaps to hidden state when reduced motion is enabled', () => {
    routeExit('.route', { reducedMotion: true, variant: 'reader' });
    expect(gsap.set).toHaveBeenCalledWith('.route', { autoAlpha: 0, y: -4 });
  });
});
