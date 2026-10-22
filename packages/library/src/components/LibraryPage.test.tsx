/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChapterId, LibraryEntry, LibraryEntryId, MangaId, MangaIdentity } from '@app/shared';
import {
  toChapterId,
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  toProviderMappingId,
} from '@app/shared';
import { LibraryPage } from './LibraryPage.js';
import { DEFAULT_LIBRARY_VIEW_STATE } from '../view-state.js';
import type { LibraryItem } from '../types.js';
import type { LibraryOverviewItem } from '../fetch-library-overview.js';
import type { LibraryUpdateReport } from '../update-queue.js';

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

function overviewItem(
  item: LibraryItem,
  overrides: Partial<LibraryOverviewItem> = {},
): LibraryOverviewItem {
  return {
    item,
    chapterCount: 2,
    unreadCount: 0,
    latestChapter: {
      id: toChapterId('ch-2'),
      providerMappingId: toProviderMappingId('map-one'),
      title: 'Chapter 2',
      index: 2,
    },
    ...overrides,
  };
}

function failedReport(entryId: string): LibraryUpdateReport {
  return {
    status: 'done',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    items: [
      {
        entryId: toLibraryEntryId(entryId),
        mangaId: toMangaId('manga-one'),
        title: 'Title 1',
        providerId: toProviderId('prov-a'),
        status: 'failed',
        newChapterCount: 0,
        updatedChapterCount: 0,
        unreadCount: 0,
        reason: 'Feed unavailable',
      },
      {
        entryId: toLibraryEntryId('entry-other'),
        mangaId: toMangaId('manga-other'),
        title: 'Other',
        providerId: toProviderId('prov-a'),
        status: 'done',
        newChapterCount: 2,
        updatedChapterCount: 0,
        unreadCount: 2,
      },
    ],
  };
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

  it('Given no reading progress, Then continue reading shows its empty state', () => {
    render(
      <LibraryPage
        data={{
          items: [createItem('one', 'Title 1')],
          categories: [],
          viewState: DEFAULT_LIBRARY_VIEW_STATE,
        }}
        isLoading={false}
        isError={false}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
        overview={{ continueReading: [], recentlyUpdated: [] }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Continue reading' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing in progress yet/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recently updated' })).toBeNull();
  });

  it('Given reading progress, Then continue reading resumes the chapter and updates list the backlog', async () => {
    const user = userEvent.setup();
    const onOpenChapter = vi.fn<(chapterId: ChapterId) => void>();
    const onOpenManga = vi.fn<(mangaId: MangaId) => void>();
    const alpha = createItem('one', 'Title 1');
    const beta = createItem('two', 'Title 2');

    render(
      <LibraryPage
        data={{
          items: [alpha, beta],
          categories: [],
          viewState: DEFAULT_LIBRARY_VIEW_STATE,
        }}
        isLoading={false}
        isError={false}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={() => {}}
        onOpenManga={onOpenManga}
        onOpenChapter={onOpenChapter}
        overview={{
          continueReading: [
            overviewItem(alpha, {
              lastReadChapter: {
                id: toChapterId('ch-1'),
                providerMappingId: toProviderMappingId('map-one'),
                title: 'Chapter 1',
                index: 1,
              },
            }),
          ],
          recentlyUpdated: [
            overviewItem(beta, {
              unreadCount: 2,
              latestChapter: {
                id: toChapterId('ch-3'),
                providerMappingId: toProviderMappingId('map-two'),
                title: 'Chapter 3',
                index: 3,
                addedAt: '2026-02-01T00:00:00.000Z',
              },
            }),
          ],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Chapter 1/ }));
    expect(onOpenChapter).toHaveBeenCalledWith(toChapterId('ch-1'));

    const recent = screen.getByRole('region', { name: 'Recently updated' });
    expect(recent).toHaveTextContent('2 new');
    expect(recent).toHaveTextContent('Not started');
    await user.click(screen.getByRole('button', { name: /Latest: Chapter 3/ }));
    expect(onOpenManga).toHaveBeenCalledWith(beta.manga.id);
  });

  it('Given a failed update report, Then retry targets that title and cancel appears while running', async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn<() => void>();
    const onRetry = vi.fn<(entryIds: readonly LibraryEntryId[]) => void>();
    const onCancel = vi.fn<() => void>();
    const onClearReport = vi.fn<() => void>();
    const item = createItem('one', 'Title 1');

    const { rerender } = render(
      <LibraryPage
        data={{ items: [item], categories: [], viewState: DEFAULT_LIBRARY_VIEW_STATE }}
        isLoading={false}
        isError={false}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
        updates={{
          status: 'idle',
          report: failedReport('entry-one'),
          onCheck,
          onCancel,
          onRetry,
          onClearReport,
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 checked');
    expect(screen.getByRole('status')).toHaveTextContent('1 failed');
    await user.click(screen.getByRole('button', { name: /^Retry$/ }));
    expect(onRetry).toHaveBeenCalledWith([toLibraryEntryId('entry-one')]);
    await user.click(screen.getByRole('button', { name: 'Clear report' }));
    expect(onClearReport).toHaveBeenCalledTimes(1);

    rerender(
      <LibraryPage
        data={{ items: [item], categories: [], viewState: DEFAULT_LIBRARY_VIEW_STATE }}
        isLoading={false}
        isError={false}
        viewState={DEFAULT_LIBRARY_VIEW_STATE}
        onViewStateChange={() => {}}
        onOpenManga={() => {}}
        updates={{
          status: 'running',
          report: failedReport('entry-one'),
          onCheck,
          onCancel,
          onRetry,
          onClearReport: () => {},
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel updates' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
