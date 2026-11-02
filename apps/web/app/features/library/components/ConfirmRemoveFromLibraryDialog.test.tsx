/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmRemoveFromLibraryDialog } from './ConfirmRemoveFromLibraryDialog.js';

describe('ConfirmRemoveFromLibraryDialog', () => {
  it('Given a destructive confirmation, Then it is announced as an alert dialog', () => {
    render(
      <ConfirmRemoveFromLibraryDialog
        open
        mangaTitle="Berserk"
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onConfirm={vi.fn<() => void>()}
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Remove “Berserk” from your library?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(
      'Its reading progress and favorite are removed from this device. You can add the title back at any time.',
    );
  });
});
