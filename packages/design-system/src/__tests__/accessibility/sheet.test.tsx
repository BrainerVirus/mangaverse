import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';

function Harness({
  onOpenChange,
  surface,
}: {
  onOpenChange?: (open: boolean) => void;
  surface?: 'glass';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <button type="button" onClick={() => setOpen(true)}>
        Settings
      </button>
      <SheetContent side="right" {...(surface !== undefined ? { surface } : {})}>
        <SheetHeader>
          <SheetTitle>Reader settings</SheetTitle>
        </SheetHeader>
        <button type="button">Left to right</button>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders as a modal dialog in a portal, outside the render container', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Reader settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container.contains(dialog)).toBe(false);
  });

  it('composes a thick glass panel and readable close control for glass sheets', async () => {
    const user = userEvent.setup();
    render(<Harness surface="glass" />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Reader settings' });
    expect(dialog.querySelector('[data-glass-tier="thick"]')).toBeTruthy();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('text-foreground', 'size-10', 'focus-visible:ring-2');
    // The 16px, dimmed target failed 2.5.8; the icon button is 40px and never dimmed.
    expect(close).not.toHaveClass('opacity-70');
  });

  it('moves focus into the sheet and returns it to the trigger on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(<Harness onOpenChange={onOpenChange} />);

    const trigger = screen.getByRole('button', { name: 'Settings' });
    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Left to right' })).toHaveFocus(),
    );

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
