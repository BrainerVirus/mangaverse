/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
    loadedCount: 2,
    allVisibleSelected: false,
    categories,
    onToggleSelectionMode: vi.fn<() => void>(),
    onSelectAllLoaded: vi.fn<() => void>(),
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

  it('Given nothing selected, Then the status control is disabled instead of silently doing nothing', () => {
    renderBulk({ selectedEntryIds: [] });

    expect(screen.getByLabelText('Set status for selected')).toBeDisabled();
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

  it('keeps the category dialog open with no inline error when the write fails, so its toast is the only surface', async () => {
    const user = userEvent.setup();
    const onOrganize = vi.fn<(action: LibraryOrganizationAction) => Promise<void>>(async () => {
      throw new Error('INTERNAL_SECRET at handle.run');
    });
    renderBulk({ onOrganize });

    await user.click(screen.getByRole('button', { name: 'Bulk categories' }));
    await user.click(screen.getByLabelText('Drama'));
    await user.click(screen.getByRole('button', { name: 'Add to selected' }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onOrganize).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/INTERNAL_SECRET|Could not/)).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Drama')).toBeChecked();
  });

  it('shows no inline error when a status or favorite edit fails', async () => {
    const user = userEvent.setup();
    const onOrganize = vi.fn<(action: LibraryOrganizationAction) => Promise<void>>(async () => {
      throw new Error('INTERNAL_SECRET at handle.run');
    });
    renderBulk({ onOrganize });

    await user.click(screen.getByRole('button', { name: 'Favorite selected' }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onOrganize).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/INTERNAL_SECRET|Could not/)).toBeNull();
  });

  it('selects all visible through the checkbox', async () => {
    const user = userEvent.setup();
    const props = renderBulk();

    await user.click(screen.getByLabelText('Select all loaded titles (2 of 2 matching)'));
    expect(props.onSelectAllLoaded).toHaveBeenCalledTimes(1);
  });

  it('hands the selection to migration when the action is available', async () => {
    const user = userEvent.setup();
    const onMigrateSelected = vi.fn<() => void>();
    renderBulk({ onMigrateSelected });

    const advanced = screen.getByText('Advanced').closest('details');
    expect(advanced).not.toHaveAttribute('open');
    await user.click(screen.getByText('Advanced'));
    await user.click(screen.getByRole('button', { name: 'Migrate selected' }));
    expect(onMigrateSelected).toHaveBeenCalledTimes(1);
  });
});
