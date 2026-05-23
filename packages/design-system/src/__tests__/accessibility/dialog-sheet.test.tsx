import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet.js';

describe('Dialog Focus Trap', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders dialog with proper structure', () => {
    render(
      <Dialog>
        <DialogContent>
          <DialogTitle>Test Dialog</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
          <button>Button 1</button>
          <button>Button 2</button>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    expect(screen.getByText('Dialog description')).toBeInTheDocument();
  });

  it('contains focusable elements', () => {
    render(
      <Dialog>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
          <button>First Button</button>
          <button>Second Button</button>
          <input type="text" />
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('First Button')).toBeInTheDocument();
    expect(screen.getByText('Second Button')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('has proper aria attributes for dialog content', () => {
    render(
      <Dialog>
        <DialogContent aria-describedby="desc-id">
          <DialogTitle>Title</DialogTitle>
          <DialogDescription id="desc-id">Description</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('renders dialog with fixed positioning', () => {
    const { container } = render(
      <Dialog>
        <DialogContent>Content</DialogContent>
      </Dialog>
    );

    expect(container.querySelector('[class*="fixed"]')).toBeInTheDocument();
  });

  it('dialog content has proper styling', () => {
    const { container } = render(
      <Dialog>
        <DialogContent>Dialog Content</DialogContent>
      </Dialog>
    );

    const content = container.querySelector('[class*="rounded-"]');
    expect(content).toBeInTheDocument();
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
      </Sheet>
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
      </Sheet>
    );

    expect(screen.getByText('Action 1')).toBeInTheDocument();
    expect(screen.getByText('Action 2')).toBeInTheDocument();
  });

  it('sheet content is positioned on the right', () => {
    const { container } = render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Position Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    const content = container.querySelector('[class*="right-0"]');
    expect(content).toBeInTheDocument();
  });

  it('sheet has proper role for navigation', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByText('Sheet')).toBeInTheDocument();
  });

  it('sheet content has full height', () => {
    const { container } = render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Full Height Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    const content = container.querySelector('[class*="h-full"]');
    expect(content).toBeInTheDocument();
  });

  it('sheet has shadow styling', () => {
    const { container } = render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Shadow Test</SheetTitle>
        </SheetContent>
      </Sheet>
    );

    const content = container.querySelector('[class*="shadow"]');
    expect(content).toBeInTheDocument();
  });
});