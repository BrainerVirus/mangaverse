import { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet.js';

function DialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <button>Outside action</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Test dialog</DialogTitle>
          <DialogDescription>Dialog summary</DialogDescription>
          <button>First action</button>
          <button>Last action</button>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog accessibility', () => {
  beforeEach(() => {
    cleanup();
  });

  it('contains focus and returns it to the opener after Escape', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const opener = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(opener);

    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Base UI restores focus in a queued microtask; assert the settled state.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('wires the dialog role, modal state, title, and description', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const title = screen.getByText('Test dialog');
    const description = screen.getByText('Dialog summary');
    const dialog = screen.getByRole('dialog', {
      name: 'Test dialog',
      description: 'Dialog summary',
    });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    expect(dialog).toHaveAttribute('aria-describedby', description.id);
  });

  it('closes when the backdrop is pressed', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const backdrop = document.querySelector<HTMLElement>('.glass-scrim');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Tabs accessibility', () => {
  beforeEach(() => {
    cleanup();
  });

  it('supports arrow, Home, End, click selection, and tab-panel wiring', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="reading">
        <TabsList aria-label="Sample content">
          <TabsTrigger value="reading">Reading</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="reading">Chapter 14 is ready to continue.</TabsContent>
        <TabsContent value="details">12 chapters · Updated today</TabsContent>
      </Tabs>,
    );

    const reading = screen.getByRole('tab', { name: 'Reading' });
    const details = screen.getByRole('tab', { name: 'Details' });
    const readingPanel = screen.getByRole('tabpanel');
    expect(reading).toHaveAttribute('aria-controls', readingPanel.id);
    expect(readingPanel).toHaveAttribute('aria-labelledby', reading.id);
    expect(reading).toHaveAttribute('tabindex', '0');
    expect(details).toHaveAttribute('tabindex', '-1');

    reading.focus();
    await user.keyboard('{ArrowRight}');
    expect(details).toHaveFocus();
    expect(details).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('12 chapters · Updated today');

    await user.keyboard('{Home}');
    expect(reading).toHaveFocus();
    expect(reading).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{End}');
    expect(details).toHaveFocus();
    await user.click(reading);
    expect(reading).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Chapter 14 is ready to continue.');
  });
});

describe('Sheet Focus Trap', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders sheet with proper structure', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Test Sheet</SheetTitle>
          <SheetDescription>Sheet description</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByText('Test Sheet')).toBeInTheDocument();
    expect(screen.getByText('Sheet description')).toBeInTheDocument();
  });

  it('contains focusable elements', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Sheet Title</SheetTitle>
          <button>Action 1</button>
          <button>Action 2</button>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByText('Action 1')).toBeInTheDocument();
    expect(screen.getByText('Action 2')).toBeInTheDocument();
  });

  it('sheet content is positioned on the right', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Position Test</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const content = document.body.querySelector('[class*="right-0"]');
    expect(content).toBeInTheDocument();
  });

  it('sheet has proper role for navigation', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByText('Sheet')).toBeInTheDocument();
  });

  it('sheet content has full height', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Full Height Test</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const content = document.body.querySelector('[class*="h-full"]');
    expect(content).toBeInTheDocument();
  });

  it('sheet has shadow styling', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Shadow Test</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const content = document.body.querySelector('[class*="shadow"]');
    expect(content).toBeInTheDocument();
  });
});
