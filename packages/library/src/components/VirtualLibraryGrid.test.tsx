/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
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

const { cardRenderSpy } = vi.hoisted(() => ({ cardRenderSpy: vi.fn<() => void>() }));

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
    measureElement: vi.fn<(...args: unknown[]) => unknown>(),
  }),
}));

vi.mock('@app/design-system', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  MangaCard: ({
    manga,
    onClick,
    unreadCount,
    sourceLabel,
  }: {
    manga: { canonicalTitle: string };
    onClick?: () => void;
    unreadCount?: number;
    sourceLabel?: string;
  }) => {
    cardRenderSpy();

    return (
      <>
        <button type="button" onClick={onClick}>
          {manga.canonicalTitle}
          {unreadCount !== undefined && unreadCount > 0 ? <span>{unreadCount} unread</span> : null}
        </button>
        {sourceLabel !== undefined ? <p>{sourceLabel}</p> : null}
      </>
    );
  },
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

const createItems = (count: number): LibraryItem[] =>
  Array.from({ length: count }, (_, index) => createItem(String(index + 1), `Title ${index + 1}`));

const scrollContainer = (children: ReactNode) => (
  <div style={{ width: 1200, height: 240, overflow: 'auto' }}>{children}</div>
);

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
        onOpenManga={vi.fn<(mangaId: string) => void>()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Library titles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 2' })).toBeInTheDocument();
  });

  it('renders only virtual rows for large libraries once scroll metrics are available', () => {
    render(
      scrollContainer(
        <VirtualLibraryGrid
          items={createItems(120)}
          layout="grid"
          onOpenManga={vi.fn<(mangaId: string) => void>()}
        />,
      ),
    );

    const renderedTitles = screen.getAllByRole('button');

    expect(renderedTitles.length).toBeGreaterThan(0);
    expect(renderedTitles.length).toBeLessThan(120);
  });

  it('caps card renders when a 200-item library mounts with virtualization active', () => {
    render(
      scrollContainer(
        <VirtualLibraryGrid
          items={createItems(200)}
          layout="grid"
          onOpenManga={vi.fn<(mangaId: string) => void>()}
        />,
      ),
    );

    expect(screen.getAllByRole('button').length).toBeLessThan(200);
    expect(cardRenderSpy.mock.calls.length).toBeLessThan(100);
  });

  it('does not re-render cards when items and callback are unchanged', () => {
    const items = createItems(200);
    const onOpenManga = vi.fn<(mangaId: string) => void>();
    const { rerender } = render(
      scrollContainer(<VirtualLibraryGrid items={items} layout="grid" onOpenManga={onOpenManga} />),
    );
    const before = cardRenderSpy.mock.calls.length;

    rerender(
      scrollContainer(<VirtualLibraryGrid items={items} layout="grid" onOpenManga={onOpenManga} />),
    );

    expect(cardRenderSpy.mock.calls.length - before).toBe(0);
  });

  it('re-renders only the card whose unread count changed', () => {
    const items = createItems(200);
    const onOpenManga = vi.fn<(mangaId: string) => void>();
    const { rerender } = render(
      scrollContainer(<VirtualLibraryGrid items={items} layout="grid" onOpenManga={onOpenManga} />),
    );
    const before = cardRenderSpy.mock.calls.length;

    const updatedItems = items.map((item, index) =>
      index === 0 ? { ...item, entry: { ...item.entry, unreadCount: 3 } } : item,
    );

    rerender(
      scrollContainer(
        <VirtualLibraryGrid items={updatedItems} layout="grid" onOpenManga={onOpenManga} />,
      ),
    );

    expect(screen.getByText('3 unread')).toBeInTheDocument();
    expect(cardRenderSpy.mock.calls.length - before).toBe(1);
  });

  it('re-renders only the visible cards when every manga ref changes', () => {
    const items = createItems(200);
    const onOpenManga = vi.fn<(mangaId: string) => void>();
    const { rerender } = render(
      scrollContainer(<VirtualLibraryGrid items={items} layout="grid" onOpenManga={onOpenManga} />),
    );
    const before = cardRenderSpy.mock.calls.length;

    const replacedItems = items.map(({ manga }) =>
      createItem(manga.id, `${manga.canonicalTitle} (updated)`),
    );

    rerender(
      scrollContainer(
        <VirtualLibraryGrid items={replacedItems} layout="grid" onOpenManga={onOpenManga} />,
      ),
    );

    const additionalRenders = cardRenderSpy.mock.calls.length - before;

    expect(additionalRenders).toBeGreaterThan(0);
    expect(additionalRenders).toBeLessThanOrEqual(15);
  });

  it('renders the complete library when there is no scrollable ancestor', () => {
    render(
      <VirtualLibraryGrid
        items={createItems(120)}
        layout="grid"
        onOpenManga={vi.fn<(mangaId: string) => void>()}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(120);
  });

  it('Given registered provider names, Then cards show the display name and never the raw id', () => {
    render(
      <VirtualLibraryGrid
        items={[createItem('1', 'Title 1')]}
        layout="grid"
        onOpenManga={vi.fn<(mangaId: string) => void>()}
        sourceLabels={{ 'test-provider': 'Test Provider' }}
      />,
    );

    expect(screen.getByText('Test Provider')).toBeInTheDocument();
    expect(screen.queryByText('test-provider')).toBeNull();
  });

  it('Given no registry lookup, Then the card prints a readable id, never the raw token', () => {
    render(
      <VirtualLibraryGrid
        items={[createItem('1', 'Title 1')]}
        layout="grid"
        onOpenManga={vi.fn<(mangaId: string) => void>()}
      />,
    );

    expect(screen.getByText('Test Provider')).toBeInTheDocument();
    expect(screen.queryByText('test-provider')).toBeNull();
  });

  it('calls onOpenManga when a visible card is clicked', () => {
    const onOpenManga = vi.fn<(mangaId: string) => void>();

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
