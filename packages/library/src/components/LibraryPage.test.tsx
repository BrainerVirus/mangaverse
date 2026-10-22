/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LibraryEntry, MangaIdentity } from '@app/shared';
import { toLibraryEntryId, toMangaId, toProviderMappingId } from '@app/shared';
import { LibraryPage } from './LibraryPage.js';
import { DEFAULT_LIBRARY_VIEW_STATE } from '../view-state.js';
import type { LibraryItem } from '../types.js';

function createItem(id: string, title: string): LibraryItem {
  const manga: MangaIdentity = {
    id: toMangaId(id),
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [],
    defaultProviderMappingId: toProviderMappingId(`map-${id}`),
    merged: false,
  };
  const entry: LibraryEntry = {
    id: toLibraryEntryId(`entry-${id}`),
    mangaId: toMangaId(id),
    favorite: false,
    categoryIds: [],
    status: 'reading',
    unreadCount: 0,
  };
  return { entry, manga };
}

describe('LibraryPage', () => {
  it('fills the shell main instead of rendering a second main landmark', () => {
    const { container } = render(
      <LibraryPage
        data={{ items: [], categories: [], viewState: DEFAULT_LIBRARY_VIEW_STATE }}
        isLoading={false}
        isError={false}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
      />,
    );

    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Library' })).toBeInTheDocument();
  });

  it('Given selected titles, When a filter changes, Then the selection is cleared', async () => {
    const user = userEvent.setup();
    const onViewStateChange = vi.fn<(next: typeof DEFAULT_LIBRARY_VIEW_STATE) => void>();

    render(
      <LibraryPage
        data={{
          items: [createItem('one', 'Title 1'), createItem('two', 'Title 2')],
          categories: [],
          viewState: DEFAULT_LIBRARY_VIEW_STATE,
        }}
        isLoading={false}
        isError={false}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={onViewStateChange}
        onOpenManga={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Select titles' }));
    await user.click(screen.getByLabelText('Select Title 1'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Favorites' }));

    expect(onViewStateChange).toHaveBeenCalledWith({
      ...DEFAULT_LIBRARY_VIEW_STATE,
      filter: { favoritesOnly: true },
    });
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favorite selected' })).toBeDisabled();
  });
});
