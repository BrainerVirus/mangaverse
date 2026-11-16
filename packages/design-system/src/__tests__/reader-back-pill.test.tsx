import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReaderBackPill } from '../components/reader-back-pill.js';
import { readingLabel } from '../components/reading-label.js';

describe('ReaderBackPill', () => {
  afterEach(cleanup);

  it('Given what is being read, Then the pill shows it after a chevron and its name starts with that visible text', () => {
    render(<ReaderBackPill label="Kuro no Shoukanshi · Ch. 1" onClick={() => {}} />);
    // Label in name (WCAG 2.5.3): saying what is on screen operates the pill.
    const button = screen.getByRole('button', {
      name: 'Kuro no Shoukanshi · Ch. 1, close reader',
    });
    expect(button).toHaveTextContent('Kuro no Shoukanshi · Ch. 1');
    expect(button.getAttribute('aria-label')).toContain(button.textContent ?? '');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveAttribute('data-variant', 'pill');
  });

  it('Given a long title, Then the label truncates inside a bounded pill instead of pushing the controls', () => {
    render(<ReaderBackPill label={`${'A very long series title '.repeat(8)}· Ch. 12`} />);
    const label = screen.getByText(/A very long series title/);
    expect(label.className).toContain('truncate');
    expect(label.className).toContain('min-w-0');
    const anchor = screen
      .getByRole('button', { name: /close reader/i })
      .closest('[data-glass-tier]');
    expect(anchor?.className).toContain('max-w-md');
    expect(anchor?.className).toContain('min-w-0');
  });

  it('Given either variant, Then there is no hover tooltip: the pill says what it is, and Esc needs no hint on touch', () => {
    render(
      <>
        <ReaderBackPill label="Ch. 1" />
        <ReaderBackPill variant="round" />
      </>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByText(/Esc/)).toBeNull();
  });

  it('Given the round variant, Then it is the chevron alone with the same name and size', () => {
    render(<ReaderBackPill variant="round" label="Ch. 1" />);
    const button = screen.getByRole('button', { name: 'Close reader' });
    expect(button).toHaveAttribute('data-variant', 'round');
    expect(button).toHaveTextContent('');
    expect(button.className).toContain('w-10');
    expect(button.className).toContain('h-10');
  });

  it('Given no label, Then the pill falls back to the round button', () => {
    render(<ReaderBackPill />);
    expect(screen.getByRole('button', { name: 'Close reader' })).toHaveAttribute(
      'data-variant',
      'round',
    );
  });

  it('Given the keyboard, When the pill takes focus and Enter or Space is pressed, Then it closes, with a visible focus ring', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn<() => void>();
    render(<ReaderBackPill label="Ch. 1" onClick={onClick} />);
    await user.tab();
    const button = screen.getByRole('button', { name: /close reader/i });
    expect(button).toHaveFocus();
    expect(button.className).toContain('focus-visible:ring-2');
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('Given series and chapter, Then the label joins what is known', () => {
    expect(readingLabel('Kuro no Shoukanshi', 'Ch. 1')).toBe('Kuro no Shoukanshi · Ch. 1');
    expect(readingLabel(undefined, 'Ch. 1')).toBe('Ch. 1');
    expect(readingLabel('', undefined)).toBeUndefined();
  });
});
