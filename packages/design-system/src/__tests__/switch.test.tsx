import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Switch } from '../components/ui/switch.js';

describe('Switch', () => {
  it('paints the off track with a token that clears the 3:1 non-text floor', () => {
    render(<Switch aria-label="Motion" checked={false} onCheckedChange={() => {}} />);

    const control = screen.getByRole('switch', { name: 'Motion' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(control).toHaveClass('bg-muted-foreground');
    expect(control).not.toHaveClass('bg-input');
  });

  it('keeps the on track on primary and the thumb on the canvas colour', () => {
    render(<Switch aria-label="Motion" checked onCheckedChange={() => {}} />);

    const control = screen.getByRole('switch', { name: 'Motion' });
    expect(control).toHaveAttribute('aria-checked', 'true');
    expect(control).toHaveClass('bg-primary');
    expect(control.firstElementChild).toHaveClass('bg-background');
  });

  it('flips the checked state once per click and ignores clicks while disabled', () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    const { rerender } = render(
      <Switch aria-label="Motion" checked={false} onCheckedChange={onCheckedChange} />,
    );
    const control = screen.getByRole('switch', { name: 'Motion' });

    control.click();
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    rerender(<Switch aria-label="Motion" checked disabled onCheckedChange={onCheckedChange} />);
    onCheckedChange.mockClear();
    control.click();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
