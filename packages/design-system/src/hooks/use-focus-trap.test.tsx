/**
 * @vitest-environment jsdom
 */
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useFocusTrap } from '../hooks/use-focus-trap.js';

function TrapHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)}>Open panel</button>
      <button>Outside action</button>
      {open ? <TrapPanel onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function TrapPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  return (
    <div ref={ref} role="dialog" aria-label="Trapped panel" tabIndex={-1}>
      <button>First action</button>
      <button>Last action</button>
      <button onClick={onClose}>Close panel</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  afterEach(() => {
    cleanup();
  });

  it('Given a modal panel, Then it takes focus, cycles on Tab and Shift+Tab, and restores on close', async () => {
    const user = userEvent.setup();
    render(<TrapHarness />);

    const opener = screen.getByRole('button', { name: 'Open panel' });
    await user.click(opener);

    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Close panel' });
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    // Shift+Tab from the first wraps to the last tabbable element in the panel.
    expect(last).toHaveFocus();

    await user.click(last);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('Given the panel is closed, Then Tab is left to the page', async () => {
    const user = userEvent.setup();
    render(<TrapHarness />);

    await user.click(screen.getByRole('button', { name: 'Open panel' }));
    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const opener = screen.getByRole('button', { name: 'Open panel' });
    await waitFor(() => expect(opener).toHaveFocus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Outside action' })).toHaveFocus();
  });
});
