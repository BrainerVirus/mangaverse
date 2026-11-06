/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  toLibraryEntryId,
  toMangaId,
  toProviderMappingId,
  type LibraryEntry,
  type MangaIdentity,
} from '@app/shared';
import { LibraryPage, type LibraryPageProps } from './LibraryPage.js';
import { DEFAULT_LIBRARY_VIEW_STATE } from '../view-state.js';
import { getColumnCount } from '../library-layout-metrics.js';
import type { LibraryItem } from '../types.js';

const updates = {
  status: 'idle',
  report: undefined,
  onCheck: vi.fn<() => void>(),
  onCancel: vi.fn<() => void>(),
  onRetry: vi.fn<(entryIds: readonly string[]) => void>(),
  onClearReport: vi.fn<() => void>(),
} as const satisfies NonNullable<LibraryPageProps['updates']>;

function item(id: string, title: string): LibraryItem {
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

function renderLibrary(overrides: Partial<LibraryPageProps> = {}) {
  return render(
    <LibraryPage
      data={undefined}
      isLoading
      isError={false}
      viewState={DEFAULT_LIBRARY_VIEW_STATE}
      onViewStateChange={() => {}}
      onOpenManga={() => {}}
      updates={updates}
      {...overrides}
    />,
  );
}

/** Columns the placeholder grid shows at a content width, read off its container-query classes. */
function placeholderColumns(grid: Element, width: number): number {
  let columns = 2;
  for (const token of grid.className.split(/\s+/)) {
    const match = /^@min-\[(\d+)px\]:grid-cols-(\d+)$/.exec(token);
    if (match !== null && width >= Number(match[1])) columns = Number(match[2]);
  }
  return columns;
}

describe('LibraryPage while the library loads', () => {
  it('keeps the page chrome on screen: header, description, toolbar and view controls', () => {
    renderLibrary();

    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Your saved manga, comics, and webtoons')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compact' })).toBeInTheDocument();
  });

  it('does not claim a count it has not read yet', () => {
    renderLibrary();

    expect(screen.queryByText('0 titles')).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+ titles?$/)).not.toBeInTheDocument();
  });

  it('shows the static update panel and shelf headings, with controls that need data disabled', () => {
    renderLibrary();

    const panel = screen.getByRole('region', { name: 'Library updates' });
    expect(within(panel).getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 2, name: 'Continue reading' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Recently updated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select titles' })).toBeDisabled();
  });

  it('never shows an empty-library message before the rows have loaded', () => {
    renderLibrary();

    expect(screen.queryByText('Browse providers')).not.toBeInTheDocument();
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('marks only the rows as a placeholder region, with two full rows of 3:4 covers and captions', () => {
    const { container } = renderLibrary();

    const region = container.querySelector('[data-library-loading]');
    expect(region).toHaveAttribute('aria-busy', 'true');
    const covers = region?.querySelectorAll('.aspect-3\\/4') ?? [];
    expect(covers).toHaveLength(12);
    // Each cell carries the caption line the loaded card has under its cover.
    for (const cover of covers) {
      expect(cover.parentElement?.querySelector('.mt-1')).not.toBeNull();
    }
  });

  it.each([320, 639, 640, 767, 768, 1023, 1024, 1279, 1280, 1920])(
    'lays the placeholder out in the loaded grid’s columns at a %ipx content width',
    (width) => {
      const { container } = renderLibrary();

      // The cover cell's parent is the grid itself (the shelves above carry grids of their own).
      const cover = container.querySelector('[data-library-loading] .aspect-3\\/4');
      const grid = cover?.parentElement?.parentElement;
      expect(grid).toBeTruthy();
      expect(placeholderColumns(grid as Element, width)).toBe(getColumnCount('grid', width));
    },
  );

  it('keeps the grid placeholder in step with the chosen layout', () => {
    const { container } = renderLibrary({
      viewState: { ...DEFAULT_LIBRARY_VIEW_STATE, layout: 'list' },
    });

    const region = container.querySelector('[data-library-loading]');
    expect(region?.querySelector('.aspect-3\\/4')).toBeNull();
    // A list row is the card's own box (gap-4, p-3) with its status line beneath.
    expect(region?.querySelectorAll('.gap-4.p-3')).toHaveLength(4);
  });

  it('holds the rows back until the shelves load too, so nothing is pushed down afterwards', () => {
    const data = {
      items: [item('a', 'Alpha'), item('b', 'Beta')],
      total: 2,
      categories: [],
      viewState: DEFAULT_LIBRARY_VIEW_STATE,
    };
    const { container, rerender } = renderLibrary({
      data,
      isLoading: false,
      isOverviewLoading: true,
    });

    expect(container.querySelector('[data-library-loading]')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Library titles' })).not.toBeInTheDocument();
    expect(screen.getByText('2 titles')).toBeInTheDocument();

    rerender(
      <LibraryPage
        data={data}
        isLoading={false}
        isError={false}
        isOverviewLoading={false}
        overview={{ continueReading: [], recentlyUpdated: [] }}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
        updates={updates}
      />,
    );

    expect(container.querySelector('[data-library-loading]')).toBeNull();
    expect(screen.getByRole('region', { name: 'Library titles' })).toBeInTheDocument();
  });
});
