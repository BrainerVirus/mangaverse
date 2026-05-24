/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  LibraryEntry,
  LibraryEntryId,
  MangaId,
  MangaIdentity,
  ProviderId,
  ProviderMappingId,
  ProviderMangaId,
} from '@app/shared';
import { VirtualLibraryGrid } from './VirtualLibraryGrid.js';
import type { LibraryItem } from '../types.js';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; enabled?: boolean }) => ({
    getTotalSize: () => options.count * 200,
    getVirtualItems: () => {
      if (options.enabled === false) {
        return [];
      }

      return Array.from({ length: Math.min(options.count, 3) }, (_, index) => ({
        key: index,
        index,
        start: index * 200,
        size: 200,
      }));
    },
    measureElement: vi.fn(),
  }),
}));

vi.mock('@app/design-system', () => ({
  MangaCard: ({
    manga,
    onClick,
  }: {
    manga: { canonicalTitle: string };
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {manga.canonicalTitle}
    </button>
  ),
}));

vi.mock('@app/motion', () => ({
  useGridStaggerReveal: () => ({ current: null }),
}));

const createManga = (id: string, title: string): MangaIdentity => ({
  id: id as MangaId,
  canonicalTitle: title,
  alternativeTitles: [],
  authors: [],
  artists: [],
  tags: [],
  status: 'ongoing',
  contentRating: 'safe',
  providerMappings: [
    {
      id: `map-${id}` as ProviderMappingId,
      providerId: 'test-provider' as ProviderId,
      providerMangaId: `external-${id}` as ProviderMangaId,
      providerUrl: 'https://example.com',
    },
  ],
  defaultProviderMappingId: `map-${id}` as ProviderMappingId,
  merged: false,
});

const createItem = (id: string, title: string): LibraryItem => ({
  entry: {
    id: `entry-${id}` as LibraryEntryId,
    mangaId: id as MangaId,
    favorite: false,
    status: 'reading',
    unreadCount: 0,
    categoryIds: [],
  } satisfies LibraryEntry,
  manga: createManga(id, title),
});

describe('VirtualLibraryGrid', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a non-virtual fallback grid before layout metrics are ready', () => {
    render(
      <VirtualLibraryGrid
        items={[createItem('1', 'Title 1'), createItem('2', 'Title 2')]}
        layout="grid"
        onOpenManga={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Library titles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 2' })).toBeInTheDocument();
  });

  it('renders only virtual rows for large libraries once scroll metrics are available', () => {
    render(
      <div style={{ width: 1200, height: 240, overflow: 'auto' }}>
        <VirtualLibraryGrid
          items={Array.from({ length: 120 }, (_, index) =>
            createItem(String(index + 1), `Title ${index + 1}`),
          )}
          layout="grid"
          onOpenManga={vi.fn()}
        />
      </div>,
    );

    const renderedTitles = screen.getAllByRole('button');

    expect(renderedTitles.length).toBeGreaterThan(0);
    expect(renderedTitles.length).toBeLessThan(120);
  });

  it('calls onOpenManga when a visible card is clicked', () => {
    const onOpenManga = vi.fn();

    render(
      <div style={{ width: 1200, height: 600, overflow: 'auto' }}>
        <VirtualLibraryGrid
          items={[createItem('1', 'Title 1')]}
          layout="list"
          onOpenManga={onOpenManga}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Title 1' }));
    expect(onOpenManga).toHaveBeenCalledWith('1');
  });
});
