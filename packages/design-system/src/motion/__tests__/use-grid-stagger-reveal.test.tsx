/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const kill = vi.fn<() => void>();
const reveal = vi.fn<(...args: unknown[]) => unknown>();
const reduced = vi.fn<() => boolean>(() => false);

vi.mock('../shell/grid-stagger-reveal.js', () => ({
  gridStaggerReveal: (...args: unknown[]) => reveal(...args),
}));
vi.mock('../hooks/use-reduced-motion.js', () => ({ useReducedMotion: () => reduced() }));

import { useGridStaggerReveal } from '../hooks/use-grid-stagger-reveal.js';

function Grid({ itemsKey, selector }: { itemsKey: string; selector?: string }) {
  const ref =
    selector === undefined
      ? useGridStaggerReveal(itemsKey, true)
      : useGridStaggerReveal(itemsKey, true, selector);
  return (
    <section ref={ref}>
      <div data-library-card>a</div>
      <div>b</div>
      <div>c</div>
    </section>
  );
}

function revealed(): number {
  const target = reveal.mock.calls[0]?.[0];
  if (!(target instanceof NodeList)) throw new Error('nothing was revealed');
  return target.length;
}

describe('useGridStaggerReveal', () => {
  beforeEach(() => {
    reveal.mockReset();
    kill.mockReset();
    reveal.mockImplementation(() => ({ kill }));
    reduced.mockReturnValue(false);
  });

  it('Given no selector, When the grid mounts, Then only library cards are revealed', () => {
    render(<Grid itemsKey="a,b,c" />);
    expect(revealed()).toBe(1);
  });

  it('Given the child selector, When the grid mounts, Then every child is revealed', () => {
    render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(revealed()).toBe(3);
  });

  it('Given the same key, When the grid re-renders, Then it does not reveal again', () => {
    const { rerender } = render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    rerender(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('Given a new key, When the result set changes, Then it reveals again', () => {
    const { rerender } = render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    rerender(<Grid itemsKey="a,b" selector=":scope > *" />);
    expect(reveal).toHaveBeenCalledTimes(2);
  });

  it('Given reduced motion, When the grid mounts, Then its items are shown at once, not animated', () => {
    reduced.mockReturnValue(true);
    render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal.mock.calls[0]?.[1]).toEqual({ reducedMotion: true });
  });

  it('Given a reveal in flight, When reduced motion turns on, Then the items snap to their end state', () => {
    const { rerender } = render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(reveal.mock.calls[0]?.[1]).toEqual({ reducedMotion: false });
    reduced.mockReturnValue(true);
    rerender(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(reveal.mock.calls[1]?.[1]).toEqual({ reducedMotion: true });
    // The running tween is stopped through its handle, or it would keep stepping after the snap.
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('Given a set shown under reduced motion, When reduced motion turns off, Then it is not replayed', () => {
    reduced.mockReturnValue(true);
    const { rerender } = render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    reduced.mockReturnValue(false);
    rerender(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('Given reduced motion toggled on then off mid-reveal, Then the end state shows once and nothing restarts', () => {
    const { rerender } = render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    reduced.mockReturnValue(true);
    rerender(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    reduced.mockReturnValue(false);
    rerender(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(reveal.mock.calls.map((call) => call[1])).toEqual([
      { reducedMotion: false },
      { reducedMotion: true },
    ]);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('Given a new set after reduced motion is off, Then it animates', () => {
    reduced.mockReturnValue(true);
    const { rerender } = render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    reduced.mockReturnValue(false);
    rerender(<Grid itemsKey="a,b,c,d" selector=":scope > *" />);
    expect(reveal.mock.calls[1]?.[1]).toEqual({ reducedMotion: false });
  });

  it('Given a new set while reduced motion is on, When it turns off, Then the set is shown at once and not replayed', () => {
    const { rerender } = render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    reduced.mockReturnValue(true);
    rerender(<Grid itemsKey="a,b" selector=":scope > *" />);
    reduced.mockReturnValue(false);
    rerender(<Grid itemsKey="a,b" selector=":scope > *" />);
    expect(reveal.mock.calls.map((call) => call[1])).toEqual([
      { reducedMotion: false },
      { reducedMotion: true },
    ]);
  });
});
