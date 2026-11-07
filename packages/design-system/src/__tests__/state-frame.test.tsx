import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StateFrame } from '../components/state-frame.js';
import { EmptyState } from '../components/empty-state.js';
import { ErrorState } from '../components/error-state.js';
import { LoadingState } from '../components/loading-state.js';

vi.mock('../motion/index.js', async () => {
  const actual = await vi.importActual('../motion/index.js');
  return {
    ...actual,
    useReducedMotion: () => false,
    fadeIn: vi.fn<(...args: unknown[]) => unknown>(),
  };
});

describe('StateFrame', () => {
  afterEach(() => {
    cleanup();
  });

  it('is a centered compact column by default', () => {
    render(<StateFrame data-testid="frame">content</StateFrame>);

    const frame = screen.getByTestId('frame');
    expect(frame).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'p-8');
    expect(frame).toHaveAttribute('data-state-frame');
  });

  it('maps padding none to no spacing', () => {
    render(<StateFrame padding="none" data-testid="frame" />);

    expect(screen.getByTestId('frame').className).not.toMatch(/(^|\s)p[xy]?-/);
  });

  it('maps padding compact and page to their spacing', () => {
    render(<StateFrame padding="compact" data-testid="compact" />);
    render(<StateFrame padding="page" data-testid="page" />);

    expect(screen.getByTestId('compact')).toHaveClass('p-8');
    expect(screen.getByTestId('page')).toHaveClass('px-6', 'py-12');
  });

  it('stretch drops the centering so children fill the column', () => {
    render(<StateFrame align="stretch" data-testid="frame" />);

    const frame = screen.getByTestId('frame');
    expect(frame).toHaveClass('flex', 'flex-col');
    expect(frame).not.toHaveClass('items-center');
    expect(frame).not.toHaveClass('justify-center');
  });

  it('forwards its ref, merges className and passes other attributes through', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(
      <StateFrame ref={ref} className="text-center p-2" id="frame" data-testid="frame">
        content
      </StateFrame>,
    );

    expect(ref.current).toBe(screen.getByTestId('frame'));
    expect(ref.current).toHaveAttribute('id', 'frame');
    expect(ref.current).toHaveClass('text-center');
    // the caller's padding wins over the frame's.
    expect(ref.current).toHaveClass('p-2');
    expect(ref.current).not.toHaveClass('p-8');
  });

  it('is the root of the empty, error and loading states', () => {
    const empty = render(<EmptyState type="no-library" />);
    expect(empty.container.firstElementChild).toHaveAttribute('data-state-frame');
    expect(empty.container.firstElementChild).toHaveClass('p-8', 'text-center', 'items-center');
    empty.unmount();

    const error = render(<ErrorState title="Error" message="Failed" />);
    expect(error.container.firstElementChild).toHaveAttribute('data-state-frame');
    expect(error.container.firstElementChild).toHaveClass('px-6', 'py-12', 'items-center');
    error.unmount();

    const loading = render(<LoadingState type="grid" />);
    const root = loading.container.firstElementChild;
    expect(root).toHaveAttribute('data-state-frame');
    expect(root).toHaveClass('@container', 'w-full');
    expect(root).not.toHaveClass('items-center');
    expect(root?.className).not.toMatch(/(^|\s)p[xy]?-/);
  });
});
