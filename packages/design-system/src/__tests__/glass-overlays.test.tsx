import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GlassSurface } from '../components/glass-surface.js';
import { Dialog, DialogContent } from '../components/ui/dialog.js';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet.js';
import { Command } from '../components/ui/command.js';

describe('glass overlay recipes', () => {
  afterEach(cleanup);

  it('Given a dialog, When rendered, Then it uses the thick glass overlay recipe', () => {
    const { container } = render(
      <Dialog>
        <DialogContent>Dialog content</DialogContent>
      </Dialog>,
    );

    const dialog = container.firstElementChild!;
    const panel = dialog.querySelector('[data-glass-tier="thick"]');

    expect(dialog).toHaveClass('glass-scrim');
    expect(panel).toHaveClass('glass-thick', 'shadow-xl', 'rounded-glass');
  });

  it('Given a default sheet, When open, Then its panel and overlay use the shared glass recipes', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Reader settings</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const panel = screen.getByRole('dialog').querySelector('[data-glass-tier="thick"]');

    expect(panel).toHaveClass('glass-thick', 'shadow-xl');
    expect(document.body.querySelector('.glass-scrim')).toBeInTheDocument();
  });

  it('Given a command panel, When rendered, Then it uses thick glass at elevation four', () => {
    const { container } = render(<Command />);
    const panel = container.firstElementChild;

    expect(panel).toHaveClass('glass-thick', 'shadow-xl', 'rounded-glass');
  });

  it('Given a thick surface, When rendered, Then it keeps elevation four', () => {
    const { container } = render(<GlassSurface level="thick" />);
    expect(container.firstElementChild).toHaveClass('glass-thick', 'shadow-xl');
  });
});
