import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
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
      <SheetContent side="right">
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
