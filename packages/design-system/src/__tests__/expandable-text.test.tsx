import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExpandableText } from '../components/expandable-text.js';

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

function stubContentHeight(height: number): void {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);
}

describe('ExpandableText', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('leaves text that fits alone: no fade, no button', () => {
    stubContentHeight(60);
    const { container } = render(<ExpandableText>Short</ExpandableText>);

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[data-clamped]')).toBeNull();
    expect(screen.getByText('Short')).toBeInTheDocument();
  });

  it('clamps long text behind a fade and grows to the full height on Show more', () => {
    stubContentHeight(400);
    const { container } = render(<ExpandableText collapsedRem={7.5}>Long text</ExpandableText>);
    const box = container.querySelector<HTMLElement>('[data-clamped]');

    expect(box).not.toBeNull();
    expect(box!.style.getPropertyValue('--expandable-height')).toBe('7.5rem');
    expect(box!.style.getPropertyValue('--expandable-fade')).toBe('3rem');
    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', box!.id);

    fireEvent.click(toggle);

    expect(container.querySelector('[data-clamped]')).toBeNull();
    const open = document.getElementById(box!.id)!;
    expect(open.style.getPropertyValue('--expandable-height')).toBe('400px');
    expect(open.style.getPropertyValue('--expandable-fade')).toBe('0px');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(document.getElementById(box!.id)!.style.getPropertyValue('--expandable-height')).toBe(
      '7.5rem',
    );
  });
});
