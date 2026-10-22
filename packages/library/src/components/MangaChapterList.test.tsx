/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  toChapterId,
  toChapterPageId,
  toMangaId,
  toProviderMappingId,
  type Chapter,
  type ChapterReadState,
} from '@app/shared';
import { MangaChapterList } from './MangaChapterList.js';

const MANGA_ID = toMangaId('manga-1');
const MAPPING_ID = toProviderMappingId('map-1');

function chapter(id: string, index: number, pages = 0, publishedAt?: string): Chapter {
  return {
    id: toChapterId(id),
    mangaId: MANGA_ID,
    providerMappingId: MAPPING_ID,
    title: `Chapter ${index}`,
    index,
    pages: Array.from({ length: pages }, (_, pageIndex) => ({
      id: toChapterPageId(`${id}-page-${pageIndex}`),
      index: pageIndex,
      image: { url: `https://example.com/${id}/${pageIndex}.jpg` },
    })),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  };
}

const chapters = [
  chapter('c-1', 1, 3, '2024-01-01T00:00:00Z'),
  chapter('c-2', 2, 0, '2024-03-01T00:00:00Z'),
  chapter('c-3', 3, 0, '2024-02-01T00:00:00Z'),
];
const readStates: ChapterReadState[] = [
  {
    chapterId: toChapterId('c-1'),
    mangaId: MANGA_ID,
    progress: { readPercent: 100, lastPageIndex: 2, completed: true },
  },
];

describe('MangaChapterList', () => {
  it('shows unread count, last read chapter and cache/download badges', () => {
    render(
      <MangaChapterList
        chapters={chapters}
        readStates={readStates}
        downloadedChapterIds={[toChapterId('c-2')]}
        mappingId={MAPPING_ID}
        lastReadChapterId={toChapterId('c-1')}
        onOpenChapter={() => {}}
      />,
    );

    expect(screen.getByTestId('chapter-summary')).toHaveTextContent(
      '2 unread · Last read: Chapter 1',
    );
    expect(screen.getAllByText('Pages cached')).toHaveLength(1);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    // The filter chips share the labels with the row badges.
    expect(screen.getAllByText('Read')).toHaveLength(2);
    expect(screen.getAllByText('Unread')).toHaveLength(3);
  });

  it('filters to unread and read chapters', () => {
    render(
      <MangaChapterList
        chapters={chapters}
        readStates={readStates}
        mappingId={MAPPING_ID}
        onOpenChapter={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.queryByText('Chapter 1')).toBeNull();
    expect(screen.getByText('Chapter 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.queryByText('Chapter 2')).toBeNull();
  });

  it('reorders chapters by latest publish date', async () => {
    const user = userEvent.setup();
    render(
      <MangaChapterList chapters={chapters} mappingId={MAPPING_ID} onOpenChapter={() => {}} />,
    );

    const trigger = screen.getByLabelText('Sort chapters');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await user.click(screen.getByRole('option', { name: 'Latest' }));

    const order = screen
      .getAllByRole('button', { name: /^Open / })
      .map((button) => button.textContent?.match(/Chapter \d/)?.[0]);
    expect(order).toEqual(['Chapter 2', 'Chapter 3', 'Chapter 1']);
  });

  it('marks one chapter read/unread and earlier chapters read', () => {
    const onSetChapterRead = vi.fn<(chapterId: unknown, read: boolean) => void>();
    const onMarkPreviousRead = vi.fn<(chapterId: unknown) => void>();

    render(
      <MangaChapterList
        chapters={chapters}
        readStates={readStates}
        mappingId={MAPPING_ID}
        onOpenChapter={() => {}}
        onSetChapterRead={onSetChapterRead}
        onMarkPreviousRead={onMarkPreviousRead}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark unread: chapter 1' }));
    expect(onSetChapterRead).toHaveBeenCalledWith(toChapterId('c-1'), false);

    fireEvent.click(screen.getByRole('button', { name: 'Mark read: chapter 2' }));
    expect(onSetChapterRead).toHaveBeenCalledWith(toChapterId('c-2'), true);

    fireEvent.click(screen.getByRole('button', { name: 'Mark previous chapters read: chapter 3' }));
    expect(onMarkPreviousRead).toHaveBeenCalledWith(toChapterId('c-3'));
  });

  it('keeps the list and shows the error when a read write fails', async () => {
    render(
      <MangaChapterList
        chapters={chapters}
        mappingId={MAPPING_ID}
        onOpenChapter={() => {}}
        onSetChapterRead={async () => {
          throw new Error('Could not update reading state.');
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark read: chapter 1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update reading state.');
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
  });
});
