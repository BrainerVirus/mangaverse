/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const reveal = vi.fn<(...args: unknown[]) => void>();
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

const revealed = () => (reveal.mock.calls[0]?.[0] as NodeListOf<Element>).length;

describe('useGridStaggerReveal', () => {
  beforeEach(() => {
    reveal.mockReset();
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

  it('Given reduced motion, When the grid mounts, Then nothing animates', () => {
    reduced.mockReturnValue(true);
    render(<Grid itemsKey="a,b,c" selector=":scope > *" />);
    expect(reveal).not.toHaveBeenCalled();
  });
});
