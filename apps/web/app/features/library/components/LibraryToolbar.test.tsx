/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toCategoryId, toProviderId, type LibraryCategory } from '@app/shared';
import { LibraryToolbar } from './LibraryToolbar.js';
import { DEFAULT_LIBRARY_VIEW_STATE } from '../view-state.js';
import type { LibraryOrganizationAction } from '../types.js';

const categories: LibraryCategory[] = [
  { id: toCategoryId('later'), name: 'Later', sortIndex: 1 },
  { id: toCategoryId('pinned'), name: 'Pinned', pinned: true, sortIndex: 2 },
];

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  return screen.getByRole('dialog', { name: 'Filters' });
}

function renderToolbar(overrides: Partial<Parameters<typeof LibraryToolbar>[0]> = {}) {
  const props = {
    viewState: DEFAULT_LIBRARY_VIEW_STATE,
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

  it('toggles favorites and clears every filter and the sort from the filters sheet', async () => {
    const user = userEvent.setup();
    const props = renderToolbar({
      viewState: {
        ...DEFAULT_LIBRARY_VIEW_STATE,
        sort: { key: 'title', direction: 'asc' },
        filter: { query: 'kur' },
      },
    });

    await openFilters(user);
    await user.click(screen.getByRole('button', { name: 'Favorites' }));
    expect(props.onFilterChange).toHaveBeenCalledWith({ query: 'kur', favoritesOnly: true });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(props.onViewStateChange).toHaveBeenCalledWith({
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: {},
    });
  });

  it('keeps search, Filters and the layout control in the row, outside the sheet', async () => {
    const user = userEvent.setup();
    const props = renderToolbar({
      viewState: { ...DEFAULT_LIBRARY_VIEW_STATE, filter: { query: 'kur' } },
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Search library')).toHaveValue('kur');
    expect(screen.queryByLabelText('Sort library')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(props.onViewStateChange).toHaveBeenCalledWith({
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: { query: 'kur' },
      layout: 'compact',
    });
    for (const name of ['Grid', 'List', 'Compact']) {
      expect(screen.getByRole('button', { name })).toHaveClass('pointer-coarse:min-h-11');
    }
  });

  it('counts the filters the sheet owns on the Filters button', () => {
    renderToolbar({
      providers: [toProviderId('prov-a')],
      viewState: {
        ...DEFAULT_LIBRARY_VIEW_STATE,
        sort: { key: 'title', direction: 'asc' },
        filter: {
          query: 'kur',
          statuses: ['reading'],
          favoritesOnly: true,
          providerIds: [toProviderId('prov-a')],
        },
      },
    });

    // status, provider, favorites and a non-default sort; the query is not counted.
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('4');
  });

  it('shows no count when only the defaults are in effect', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('offers category management from the sheet when there are no categories', async () => {
    const user = userEvent.setup();
    renderToolbar({ categories: [] });

    expect(screen.queryByRole('button', { name: 'All titles' })).toBeNull();
    await openFilters(user);
    await user.click(screen.getByRole('button', { name: 'Manage categories' }));
    expect(screen.getByLabelText('New category')).toBeInTheDocument();
  });

  it('changes the sort through the select', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await openFilters(user);
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

    // "Later" is the first unpinned category and "Pinned" is the only pinned one,
    // so neither arrow can cross the pinned boundary.
    expect(screen.getByRole('button', { name: 'Move Later up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Pinned down' })).toBeDisabled();
  });

  it('reorders categories only inside their pinned or unpinned group', async () => {
    const user = userEvent.setup();
    const props = renderToolbar({
      categories: [
        { id: toCategoryId('pin-a'), name: 'Pin A', pinned: true, sortIndex: 0 },
        { id: toCategoryId('pin-b'), name: 'Pin B', pinned: true, sortIndex: 1 },
        { id: toCategoryId('later'), name: 'Later', sortIndex: 2 },
        { id: toCategoryId('drama'), name: 'Drama', sortIndex: 3 },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Manage categories' }));

    expect(screen.getByRole('button', { name: 'Move Pin A up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Pin B down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Later up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Drama down' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Drama up' }));
    expect(props.onOrganize).toHaveBeenCalledWith({
      type: 'reorder_categories',
      categoryIds: [
        toCategoryId('pin-a'),
        toCategoryId('pin-b'),
        toCategoryId('drama'),
        toCategoryId('later'),
      ],
    });
  });

  it('clears the status and provider filters individually', async () => {
    const user = userEvent.setup();
    const props = renderToolbar({
      providers: [toProviderId('prov-a')],
      viewState: {
        ...DEFAULT_LIBRARY_VIEW_STATE,
        filter: { statuses: ['reading'], providerIds: [toProviderId('prov-a')] },
      },
    });

    await openFilters(user);
    const status = screen.getByLabelText('Filter by status');
    fireEvent.keyDown(status, { key: 'ArrowDown' });
    await user.click(screen.getByRole('option', { name: 'All statuses' }));
    expect(props.onFilterChange).toHaveBeenCalledWith({ providerIds: [toProviderId('prov-a')] });

    const provider = screen.getByLabelText('Filter by provider');
    fireEvent.keyDown(provider, { key: 'ArrowDown' });
    await user.click(screen.getByRole('option', { name: 'All providers' }));
    expect(props.onFilterChange).toHaveBeenCalledWith({ statuses: ['reading'] });
  });

  it('exposes the reading-status and provider sorts', async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await openFilters(user);
    const trigger = screen.getByLabelText('Sort library');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await user.click(screen.getByRole('option', { name: 'Unread · most' }));
    expect(props.onViewStateChange).toHaveBeenCalledWith({
      ...DEFAULT_LIBRARY_VIEW_STATE,
      sort: { key: 'unread', direction: 'desc' },
    });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Last read · recent' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Provider · A–Z' })).toBeInTheDocument();
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
