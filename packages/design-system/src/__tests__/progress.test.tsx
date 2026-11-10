import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Progress } from '../components/ui/progress.js';

describe('Progress', () => {
  it('Given a value and a name, Then it is a named progressbar carrying the value', () => {
    render(<Progress aria-label="Download progress" value={40} />);
    const bar = screen.getByRole('progressbar', { name: 'Download progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '40%');
  });

  it('Given a changing value, Then the bar is not a live region, so the percent stays quiet', () => {
    const { rerender } = render(<Progress aria-label="Download progress" value={10} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-live');
    expect(bar.closest('[aria-live]')).toBeNull();
    rerender(<Progress aria-label="Download progress" value={80} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
  });

  it('Given a value, Then the fill is that wide and eases there, snapping for reduced motion', () => {
    const { container } = render(<Progress aria-label="Download progress" value={40} />);
    const fill = container.querySelector<HTMLElement>('[class*="bg-primary"]')!;
    expect(fill.style.width).toBe('40%');
    expect(fill).toHaveClass('progress-fill', 'motion-reduce:transition-none');
  });

  it('Given no value, Then it is indeterminate', () => {
    render(<Progress aria-label="Checking" value={null} />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });

  it('Given the track, Then it uses the token radius and the muted fill, with no arbitrary value', () => {
    const { container } = render(<Progress aria-label="Download progress" value={0} />);
    const track = container.querySelector<HTMLElement>('[class*="bg-muted"]')!;
    expect(track).toHaveClass('rounded-badge', 'overflow-hidden');
  });
});
