import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeOption } from '../components/theme-option.js';

describe('ThemeOption', () => {
  afterEach(() => {
    cleanup();
  });

  it('marks the selected tile and owns the selection ring', () => {
    render(
      <ThemeOption selected label="Select Warm Paper theme" onSelect={vi.fn<() => void>()}>
        <span>Preview</span>
      </ThemeOption>,
    );

    const button = screen.getByRole('button', { name: 'Select Warm Paper theme' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('data-selected', 'true');
    expect(button).toHaveClass('data-[selected=true]:ring-2', 'focus-visible:ring-2');
    expect(button.className).not.toMatch(/\bborder-transparent\b/);
  });

  it('calls onSelect and keeps an unselected tile unpressed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<() => void>();
    render(
      <ThemeOption selected={false} label="Select Dark theme" onSelect={onSelect}>
        <span>Preview</span>
      </ThemeOption>,
    );

    const button = screen.getByRole('button', { name: 'Select Dark theme' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disables the tile and keeps actions outside the button', () => {
    render(
      <ThemeOption
        selected={false}
        disabled
        label="Select Custom theme"
        onSelect={vi.fn<() => void>()}
        actions={<button type="button">Duplicate</button>}
      >
        <span>Preview</span>
      </ThemeOption>,
    );

    const tile = screen.getByRole('button', { name: 'Select Custom theme' });
    expect(tile).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
  });
});
