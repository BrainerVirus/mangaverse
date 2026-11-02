/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  MangaId,
  MangaIdentity,
  ProviderId,
  ProviderMappingId,
  ProviderMangaId,
} from '@app/shared';
import { VirtualSearchGrid } from './VirtualSearchGrid.js';

vi.mock('@app/design-system', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  MangaCard: ({
    manga,
    onClick,
    sourceLabel,
  }: {
    manga: { canonicalTitle: string };
    onClick?: () => void;
    sourceLabel?: string;
  }) => (
    <>
      <button type="button" onClick={onClick}>
        {manga.canonicalTitle}
      </button>
      {sourceLabel !== undefined ? <p>{sourceLabel}</p> : null}
    </>
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

const VIEWPORT_HEIGHT = 240;
const ROW_HEIGHT = 240;
/** One visible row, one partly visible row, and the virtualizer's overscan of 3 either side. */
const MAX_WINDOW_ROWS = 8;
/** clientWidth 1200 in the fixture resolves to 5 columns. */
const COLUMNS = 5;

const createResults = (count: number): MangaIdentity[] =>
  Array.from({ length: count }, (_, index) => createManga(String(index + 1), `Title ${index + 1}`));

const mountedTitles = () =>
  screen.queryAllByRole('button', { name: /^Title \d+$/ }).map((card) => card.textContent);

describe('VirtualSearchGrid', () => {
  beforeEach(() => {
    // jsdom has no layout: give the real virtualizer a viewport and measured rows.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset['index'] === undefined ? VIEWPORT_HEIGHT : ROW_HEIGHT;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Given 120 results and an unmeasured container, Then the first commit mounts at most 48 cards', () => {
    let firstCommitCards: number | undefined;
    let firstCommitGrid: HTMLElement | undefined;

    render(
      <div style={{ width: 1200, height: VIEWPORT_HEIGHT, overflow: 'auto' }}>
        <VirtualSearchGrid
          results={createResults(120)}
          onOpenManga={vi.fn<(mangaId: string) => void>()}
        />
        {/* Refs attach in the commit, before the grid's measured state re-renders it. */}
        <span
          ref={(node) => {
            if (node === null) return;
            firstCommitCards ??= mountedTitles().length;
            firstCommitGrid ??= screen.getByTestId('search-results-grid');
          }}
        />
      </div>,
    );

    expect(firstCommitCards).toBe(48);
    // The measuring hooks stay bound to this node; replacing it would strand them on a
    // detached element that reports a width of 0, so the grid would never virtualize.
    expect(screen.getByTestId('search-results-grid')).toBe(firstCommitGrid);
  });

  it('Given 120 measured results, When scrolled to the end, Then every result is reachable inside a bounded window', () => {
    render(
      <div
        data-testid="scroller"
        style={{ width: 1200, height: VIEWPORT_HEIGHT, overflow: 'auto' }}
      >
        <VirtualSearchGrid
          results={createResults(120)}
          onOpenManga={vi.fn<(mangaId: string) => void>()}
        />
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    // The grid moves up as the parent scrolls, which keeps its scroll margin constant.
    vi.spyOn(screen.getByTestId('search-results-grid'), 'getBoundingClientRect').mockImplementation(
      () => ({ top: -scroller.scrollTop }) as DOMRect,
    );
    const seen = new Set(mountedTitles());

    expect(seen.has('Title 1')).toBe(true);
    expect(seen.has('Title 120')).toBe(false);

    const rowCount = 120 / COLUMNS;
    for (let row = 1; row < rowCount; row += 1) {
      // jsdom's scrollTop setter discards the value.
      Object.defineProperty(scroller, 'scrollTop', {
        configurable: true,
        value: row * (ROW_HEIGHT + 16),
      });
      fireEvent.scroll(scroller);
      const mounted = mountedTitles();
      expect(mounted.length).toBeLessThanOrEqual(MAX_WINDOW_ROWS * COLUMNS);
      for (const title of mounted) seen.add(title);
    }

    expect(seen.size).toBe(120);
    expect(mountedTitles()).toContain('Title 120');
  });

  it('Given a grid below the page header, Then its first row starts at the top of the grid', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return { top: this.dataset['testid'] === 'search-results-grid' ? 300 : 0 } as DOMRect;
    });

    render(
      <div style={{ width: 1200, height: VIEWPORT_HEIGHT, overflow: 'auto' }}>
        <VirtualSearchGrid
          results={createResults(120)}
          onOpenManga={vi.fn<(mangaId: string) => void>()}
        />
      </div>,
    );

    const firstRow = screen.getByTestId('search-results-grid').querySelector('[data-index="0"]');
    expect(firstRow).toHaveStyle({ transform: 'translateY(0px)' });
  });

  it('renders a non-virtual fallback grid before layout metrics are ready', () => {
    render(
      <VirtualSearchGrid
        results={[createManga('1', 'Title 1'), createManga('2', 'Title 2')]}
        onOpenManga={vi.fn<(mangaId: string) => void>()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Search results' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title 2' })).toBeInTheDocument();
  });

  it('Given registered provider names, Then cards show the display name and never the raw id', () => {
    render(
      <VirtualSearchGrid
        results={[createManga('1', 'Title 1')]}
        onOpenManga={vi.fn<(mangaId: string) => void>()}
        sourceLabels={{ 'test-provider': 'Exact Display Name' }}
      />,
    );

    expect(screen.getByText('Exact Display Name')).toBeInTheDocument();
    expect(screen.queryByText('Test Provider')).toBeNull();
    expect(screen.queryByText('test-provider')).toBeNull();
  });

  it('renders static grid inside a scroll container for typical result sizes', () => {
    render(
      <div style={{ width: 1200, height: 240, overflow: 'auto' }}>
        <VirtualSearchGrid
          results={Array.from({ length: 24 }, (_, index) =>
            createManga(String(index + 1), `Title ${index + 1}`),
          )}
          onOpenManga={vi.fn<(mangaId: string) => void>()}
        />
      </div>,
    );

    expect(screen.getByTestId('search-results-grid')).toHaveClass('grid');
    expect(screen.getAllByRole('button', { name: /Title \d+/ }).length).toBe(24);
  });

  it('renders only virtual rows for large result sets once scroll metrics are available', () => {
    render(
      <div style={{ width: 1200, height: 240, overflow: 'auto' }}>
        <VirtualSearchGrid
          results={Array.from({ length: 120 }, (_, index) =>
            createManga(String(index + 1), `Title ${index + 1}`),
          )}
          onOpenManga={vi.fn<(mangaId: string) => void>()}
        />
      </div>,
    );

    const renderedTitles = screen.getAllByRole('button');

    expect(renderedTitles.length).toBeGreaterThan(0);
    expect(renderedTitles.length).toBeLessThan(120);
  });

  it('calls onOpenManga when a visible card is clicked', () => {
    const onOpenManga = vi.fn<(mangaId: string) => void>();

    render(
      <div style={{ width: 1200, height: 600, overflow: 'auto' }}>
        <VirtualSearchGrid results={[createManga('1', 'Title 1')]} onOpenManga={onOpenManga} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Title 1' }));
    expect(onOpenManga).toHaveBeenCalledWith('1');
  });
});
