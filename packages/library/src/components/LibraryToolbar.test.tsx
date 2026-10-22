/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toCategoryId, type LibraryCategory } from '@app/shared';
import { LibraryToolbar } from './LibraryToolbar.js';
import { DEFAULT_LIBRARY_VIEW_STATE } from '../view-state.js';
import type { LibraryOrganizationAction } from '../types.js';

const categories: LibraryCategory[] = [
  { id: toCategoryId('later'), name: 'Later', sortIndex: 1 },
  { id: toCategoryId('pinned'), name: 'Pinned', pinned: true, sortIndex: 2 },
];

function renderToolbar(overrides: Partial<Parameters<typeof LibraryToolbar>[0]> = {}) {
  const props = {
    viewState: DEFAULT_LIBRARY_VIEW_STATE,
    itemCount: 3,
    categories,
    providers: [],
    onViewStateChange: vi.fn<(next: typeof DEFAULT_LIBRARY_VIEW_STATE) => void>(),
    onFilterChange: vi.fn<(filter: typeof DEFAULT_LIBRARY_VIEW_STATE.filter) => void>(),
    onOrganize: vi.fn<(action: LibraryOrganizationAction) => Promise<void>>(async () => {}),
    ...overrides,
  };
  render(<LibraryToolbar {...props} />);
  return props;
}

describe('LibraryToolbar', () => {
  it('Given pinned categories, Then they render before unpinned categories and filter on click', () => {
    const props = renderToolbar();

    const chips = screen
      .getAllByRole('button')
      .filter((button) => ['All titles', 'Pinned', 'Later'].includes(button.textContent ?? ''));
    expect(chips.map((button) => button.textContent)).toEqual(['All titles', 'Pinned', 'Later']);

    fireEvent.click(screen.getByRole('button', { name: 'Pinned' }));
    expect(props.onFilterChange).toHaveBeenCalledWith({
      categoryIds: [toCategoryId('pinned')],
    });
  });

  it('toggles favorites and clears every filter', () => {
    const props = renderToolbar({
      viewState: { ...DEFAULT_LIBRARY_VIEW_STATE, filter: { query: 'kur' } },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    expect(props.onFilterChange).toHaveBeenCalledWith({ query: 'kur', favoritesOnly: true });

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(props.onFilterChange).toHaveBeenCalledWith({});
  });

  it('changes the sort through the select', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    const trigger = screen.getByLabelText('Sort library');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(props.onViewStateChange).toHaveBeenCalledWith({
      ...DEFAULT_LIBRARY_VIEW_STATE,
      sort: { key: 'date_added', direction: 'asc' },
    });
  });

  it('creates categories from the manager dialog', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    await user.type(screen.getByLabelText('New category'), 'Favorites');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'create_category',
      name: 'Favorites',
    });
  });

  it('renames and reorders categories from the manager dialog', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Manage categories' }));

    await user.click(screen.getByRole('button', { name: 'Rename Later' }));
    const field = screen.getByLabelText('Rename Later');
    await user.clear(field);
    await user.type(field, 'Drama');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'rename_category',
      categoryId: toCategoryId('later'),
      name: 'Drama',
      color: '',
    });

    // "Pinned" is first, so moving Later up swaps them.
    await user.click(screen.getByRole('button', { name: 'Move Later up' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'reorder_categories',
      categoryIds: [toCategoryId('later'), toCategoryId('pinned')],
    });
  });

  it('pins and confirms deletion from the manager dialog', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    await user.click(screen.getByRole('button', { name: 'Pin Later' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'set_category_pinned',
      categoryId: toCategoryId('later'),
      pinned: true,
    });

    await user.click(screen.getByRole('button', { name: 'Delete Later' }));
    expect(screen.getByText(/Delete “Later”\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm delete Later' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'delete_category',
      categoryId: toCategoryId('later'),
    });
  });
});
