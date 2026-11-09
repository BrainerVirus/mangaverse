/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

const reveal = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('../shell/grid-stagger-reveal.js', () => ({
  gridStaggerReveal: (...args: unknown[]) => reveal(...args),
}));

import { useGridStaggerReveal } from '../hooks/use-grid-stagger-reveal.js';
import { setInAppReducedMotionPreference } from '../utils/reduced-motion-preference.js';

function Grid() {
  const ref = useGridStaggerReveal('a,b', true, ':scope > *');
  return (
    <section ref={ref}>
      <div>a</div>
      <div>b</div>
    </section>
  );
}

// The real useReducedMotion subscription, driven by the in-app preference only.
describe('useGridStaggerReveal with the in-app reduced-motion preference', () => {
  beforeEach(() => {
    reveal.mockReset();
    reveal.mockImplementation(() => ({ kill: vi.fn<() => void>() }));
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    act(() => setInAppReducedMotionPreference(false));
    vi.unstubAllGlobals();
  });

  it('Given a reveal in flight, When the in-app preference turns reduced on, Then the end state is applied once, and turning it off does not replay', () => {
    render(<Grid />);
    act(() => setInAppReducedMotionPreference(true));
    act(() => setInAppReducedMotionPreference(false));
    expect(reveal.mock.calls.map((call) => call[1])).toEqual([
      { reducedMotion: false },
      { reducedMotion: true },
    ]);
  });
});
