/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  toCategoryId,
  toLibraryEntryId,
  type LibraryCategory,
  type LibraryEntryId,
} from '@app/shared';
import { BulkEditBar } from './BulkEditBar.js';
import type { LibraryOrganizationAction } from '../types.js';

const categories: LibraryCategory[] = [
  { id: toCategoryId('action'), name: 'Action' },
  { id: toCategoryId('drama'), name: 'Drama' },
];
const selected: LibraryEntryId[] = [toLibraryEntryId('entry-1'), toLibraryEntryId('entry-2')];

function renderBulk(overrides: Partial<Parameters<typeof BulkEditBar>[0]> = {}) {
  const props = {
    selectionMode: true,
    selectedEntryIds: selected,
    visibleCount: 2,
    allVisibleSelected: false,
    categories,
    onToggleSelectionMode: vi.fn<() => void>(),
    onSelectAllVisible: vi.fn<() => void>(),
    onClearSelection: vi.fn<() => void>(),
    onOrganize: vi.fn<(action: LibraryOrganizationAction) => Promise<void>>(async () => {}),
    ...overrides,
  };
  render(<BulkEditBar {...props} />);
  return props;
}

describe('BulkEditBar', () => {
  it('enters selection mode from the passive state', async () => {
    const user = userEvent.setup();
    const props = renderBulk({ selectionMode: false });

    await user.click(screen.getByRole('button', { name: 'Select titles' }));
    expect(props.onToggleSelectionMode).toHaveBeenCalledTimes(1);
  });

  it('favorites the selected titles', async () => {
    const user = userEvent.setup();
    const props = renderBulk();

    await user.click(screen.getByRole('button', { name: 'Favorite selected' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'set_entries_favorite',
      entryIds: selected,
      favorite: true,
    });

    await user.click(screen.getByRole('button', { name: 'Unfavorite selected' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'set_entries_favorite',
      entryIds: selected,
      favorite: false,
    });
  });

  it('sets a status and adds categories to the selection', async () => {
    const user = userEvent.setup();
    const props = renderBulk();

    const status = screen.getByLabelText('Set status for selected');
    status.focus();
    // ArrowDown opens the listbox; the popup must be live before Enter can commit
    // the highlighted item, otherwise Enter re-toggles the trigger. Waiting for the
    // option also covers a popup whose mount is deferred under CPU starvation.
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('option', { name: 'Reading' });
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(props.onOrganize).toHaveBeenCalledWith({
        type: 'set_entries_status',
        entryIds: selected,
        status: 'reading',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Bulk categories' }));
    await user.click(screen.getByLabelText('Drama'));
    await user.click(screen.getByRole('button', { name: 'Add to selected' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'add_entry_categories',
      entryIds: selected,
      categoryIds: [toCategoryId('drama')],
    });
  });

  it('removes categories and clears the selection', async () => {
    const user = userEvent.setup();
    const props = renderBulk();

    await user.click(screen.getByRole('button', { name: 'Bulk categories' }));
    await user.click(screen.getByLabelText('Action'));
    await user.click(screen.getByRole('button', { name: 'Remove from selected' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'remove_entry_categories',
      entryIds: selected,
      categoryIds: [toCategoryId('action')],
    });

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(props.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('keeps the category dialog open and shows the error when the write fails', async () => {
    const user = userEvent.setup();
    const onOrganize = vi.fn<(action: LibraryOrganizationAction) => Promise<void>>(async () => {
      throw new Error('Could not save categories.');
    });
    renderBulk({ onOrganize });

    await user.click(screen.getByRole('button', { name: 'Bulk categories' }));
    await user.click(screen.getByLabelText('Drama'));
    await user.click(screen.getByRole('button', { name: 'Add to selected' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save categories.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Drama')).toBeChecked();
  });

  it('selects all visible through the checkbox', async () => {
    const user = userEvent.setup();
    const props = renderBulk();

    await user.click(screen.getByLabelText('Select all visible titles'));
    expect(props.onSelectAllVisible).toHaveBeenCalledTimes(1);
  });

  it('hands the selection to migration when the action is available', async () => {
    const user = userEvent.setup();
    const onMigrateSelected = vi.fn<() => void>();
    renderBulk({ onMigrateSelected });

    await user.click(screen.getByRole('button', { name: 'Migrate selected' }));
    expect(onMigrateSelected).toHaveBeenCalledTimes(1);
  });
});
