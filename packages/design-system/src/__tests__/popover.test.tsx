import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js';

function renderPopover(props: { open?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  return render(
    <Popover {...props}>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Heading</PopoverTitle>
        <PopoverDescription>Body</PopoverDescription>
        <button type="button">Inside</button>
      </PopoverContent>
    </Popover>,
  );
}

describe('Popover', () => {
  it('Given it is closed, Then nothing is rendered and the trigger says it is collapsed', () => {
    renderPopover({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('Given it is open, Then a dialog is named by its title and described by its body', () => {
    renderPopover({ open: true });
    const panel = screen.getByRole('dialog', { name: 'Heading' });
    expect(panel).toHaveAccessibleDescription('Body');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('Given it is open, Then it is a thick glass layer at the lift step on the token radius', () => {
    renderPopover({ open: true });
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-glass-tier', 'thick');
    expect(panel.className).toContain('rounded-glass');
    expect(panel.className).toContain('shadow-lg');
    expect(panel.className).toContain('w-80');
  });

  it('Given reduced motion, Then the entrance animation is turned off', () => {
    renderPopover({ open: true });
    expect(screen.getByRole('dialog').className).toContain('motion-reduce:animate-none');
  });

  it('Given the trigger is clicked, Then it asks to open', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    renderPopover({ open: false, onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(true);
  });

  it('Given Escape, Then it asks to close', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    renderPopover({ open: true, onOpenChange });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });
});
