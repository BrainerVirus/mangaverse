/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  MangaId,
  MangaIdentity,
  ProviderId,
  ProviderMappingId,
  ProviderMangaId,
} from '@app/shared';
import { VirtualSearchGrid } from './VirtualSearchGrid.js';

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

describe('VirtualSearchGrid', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a non-virtual fallback grid before layout metrics are ready', () => {
    render(
      <VirtualSearchGrid
        results={[createManga('1', 'Title 1'), createManga('2', 'Title 2')]}
        onOpenManga={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Search results' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 2' })).toBeInTheDocument();
  });

  it('renders only virtual rows for large result sets once scroll metrics are available', () => {
    render(
      <div style={{ width: 1200, height: 240, overflow: 'auto' }}>
        <VirtualSearchGrid
          results={Array.from({ length: 120 }, (_, index) =>
            createManga(String(index + 1), `Title ${index + 1}`),
          )}
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
        <VirtualSearchGrid
          results={[createManga('1', 'Title 1')]}
          onOpenManga={onOpenManga}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Title 1' }));
    expect(onOpenManga).toHaveBeenCalledWith('1');
  });
});
