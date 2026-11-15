/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type * as Motion from '@app/design-system/motion';

const router = vi.hoisted(() => ({
  /** The URL, which moves as soon as a navigation starts. */
  pathname: '/library',
  /** The page on screen, which moves once the next page has loaded. */
  shown: '/library',
}));

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: router.pathname }),
  useMatches: ({ select }: { select: (matches: { pathname: string }[]) => unknown }) =>
    select([{ pathname: '/' }, { pathname: router.shown }]),
}));

const motion = vi.hoisted(() => ({ enters: 0 }));

vi.mock('@app/design-system/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof Motion>();
  return {
    ...actual,
    useReducedMotion: () => false,
    routeEnter: (...args: Parameters<typeof actual.routeEnter>) => {
      motion.enters += 1;
      return actual.routeEnter(...args);
    },
  };
});

import { AnimatedRouteOutlet } from '../AnimatedRouteOutlet.js';

afterEach(() => {
  cleanup();
  router.pathname = '/library';
  router.shown = '/library';
  motion.enters = 0;
});

function outletOf(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

/** What the outlet paints right now: hidden, or how opaque. */
function paint(outlet: HTMLElement) {
  return {
    hidden: outlet.style.visibility === 'hidden',
    opacity: outlet.style.opacity === '' ? 1 : Number(outlet.style.opacity),
  };
}

describe('AnimatedRouteOutlet', () => {
  it('Given a navigation, Then the page settles in without ever being hidden', () => {
    const { container, rerender } = render(<AnimatedRouteOutlet>Library</AnimatedRouteOutlet>);
    expect(paint(outletOf(container)).hidden).toBe(false);
    expect(paint(outletOf(container)).opacity).toBeGreaterThanOrEqual(0.85);

    router.pathname = '/discover';
    router.shown = '/discover';
    rerender(<AnimatedRouteOutlet>Discover</AnimatedRouteOutlet>);
    expect(paint(outletOf(container)).hidden).toBe(false);
    expect(paint(outletOf(container)).opacity).toBeGreaterThanOrEqual(0.85);
  });

  it('Given a navigation whose page is still loading, Then the enter waits for the page, once', () => {
    const { rerender } = render(<AnimatedRouteOutlet>Detail</AnimatedRouteOutlet>);
    expect(motion.enters).toBe(1);

    // The URL moved; the detail page is still on screen while the reader loads.
    router.pathname = '/reader/chapter-1';
    rerender(<AnimatedRouteOutlet>Detail</AnimatedRouteOutlet>);
    expect(motion.enters).toBe(1);

    router.shown = '/reader/chapter-1';
    rerender(<AnimatedRouteOutlet>Reader</AnimatedRouteOutlet>);
    expect(motion.enters).toBe(2);
    rerender(<AnimatedRouteOutlet>Reader</AnimatedRouteOutlet>);
    expect(motion.enters).toBe(2);
  });
});
