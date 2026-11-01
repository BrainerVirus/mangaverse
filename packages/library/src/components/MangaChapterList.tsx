import { useState, type CSSProperties, type Key, type RefObject } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@app/design-system';
import type { Chapter, ChapterId, ChapterReadState, ProviderMappingId } from '@app/shared';
import {
  chaptersForMapping,
  countUnreadChapters,
  readChapterIds,
  selectChapters,
  type ChapterFilter,
  type ChapterSort,
} from '../chapter-list.js';
import { useChapterVirtualizer } from '../hooks/use-chapter-virtualizer.js';

export interface MangaChapterListProps {
  readonly chapters: readonly Chapter[];
  readonly readStates?: readonly ChapterReadState[];
  readonly downloadedChapterIds?: readonly ChapterId[];
  readonly mappingId?: ProviderMappingId;
  readonly lastReadChapterId?: ChapterId;
  readonly isPending?: boolean;
  readonly isLoading?: boolean;
  readonly loadError?: string;
  onOpenChapter: (chapterId: ChapterId) => void;
  onRetryLoad?: () => void;
  onSetChapterRead?: (chapterId: ChapterId, read: boolean) => Promise<void> | void;
  onMarkPreviousRead?: (chapterId: ChapterId) => Promise<void> | void;
}

const SORT_OPTIONS: readonly { value: ChapterSort; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'latest', label: 'Latest' },
  { value: 'unread', label: 'Unread first' },
];

const FILTER_OPTIONS: readonly { value: ChapterFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

interface ChapterListRow {
  readonly key: Key;
  readonly chapter: Chapter;
  readonly position: number;
  readonly dataIndex: number | undefined;
  readonly measure: ((node: Element | null) => void) | undefined;
  readonly style: CSSProperties | undefined;
}

interface ChapterWindow {
  readonly rows: readonly VirtualItem[];
  readonly scrollMargin: number;
  readonly measureRow: (node: Element | null) => void;
  readonly isVirtualized: boolean;
}

/**
 * The rows to mount: every chapter in the plain path, the virtualizer's window
 * otherwise. Kept out of the component so its render branches stay shallow.
 */
function buildChapterRows(
  chapters: readonly Chapter[],
  window: ChapterWindow,
): readonly ChapterListRow[] {
  if (!window.isVirtualized) {
    return chapters.map((chapter, position) => ({
      key: chapter.id,
      chapter,
      position,
      dataIndex: undefined,
      measure: undefined,
      style: undefined,
    }));
  }

  return window.rows.flatMap((row) => {
    const chapter = chapters[row.index];
    if (chapter === undefined) return [];
    return [
      {
        key: row.key,
        chapter,
        position: row.index,
        dataIndex: row.index,
        measure: window.measureRow,
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${row.start - window.scrollMargin}px)`,
        },
      } satisfies ChapterListRow,
    ];
  });
}

interface ChapterRowContentProps {
  readonly chapter: Chapter;
  readonly isFirst: boolean;
  readonly isRead: boolean;
  readonly isDownloaded: boolean;
  readonly isPending: boolean;
  onOpenChapter: (chapterId: ChapterId) => void;
  onSetChapterRead: ((chapterId: ChapterId, read: boolean) => Promise<void> | void) | undefined;
  onMarkPreviousRead: ((chapterId: ChapterId) => Promise<void> | void) | undefined;
  run: (action: () => Promise<void> | void) => void;
}

/** One row's controls; the `<li>` and its positioning stay with the list. */
function ChapterRowContent({
  chapter,
  isFirst,
  isRead,
  isDownloaded,
  isPending,
  onOpenChapter,
  onSetChapterRead,
  onMarkPreviousRead,
  run,
}: ChapterRowContentProps) {
  return (
    <>
      <button
        type="button"
        aria-label={`Open ${chapter.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpenChapter(chapter.id)}
      >
        <span className="min-w-0">
          <span id={`chapter-title-${chapter.id}`} className="block truncate font-medium">
            {chapter.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {chapter.volume !== undefined ? <span>{chapter.volume}</span> : null}
            <Badge variant={isRead ? 'secondary' : 'outline'}>{isRead ? 'Read' : 'Unread'}</Badge>
            {chapter.pages.length > 0 ? (
              <Badge variant="outline" title="Page URLs are cached on this device">
                Pages cached
              </Badge>
            ) : null}
            {isDownloaded ? (
              <Badge variant="secondary" title="Page images are downloaded on this device">
                Offline
              </Badge>
            ) : null}
          </span>
        </span>
      </button>

      {onSetChapterRead !== undefined ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          aria-label={`${isRead ? 'Mark unread' : 'Mark read'}: chapter ${chapter.index}`}
          aria-describedby={`chapter-title-${chapter.id}`}
          onClick={() => run(() => onSetChapterRead(chapter.id, !isRead))}
        >
          {isRead ? 'Unread' : 'Read'}
        </Button>
      ) : null}

      {onMarkPreviousRead !== undefined && !isFirst ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          aria-label={`Mark previous chapters read: chapter ${chapter.index}`}
          aria-describedby={`chapter-title-${chapter.id}`}
          onClick={() => run(() => onMarkPreviousRead(chapter.id))}
        >
          Previous
        </Button>
      ) : null}
    </>
  );
}

function ChapterListEmpty({
  isLoading,
  loadError,
  onRetry,
}: {
  readonly isLoading: boolean;
  readonly loadError: string | undefined;
  onRetry: (() => void) | undefined;
}) {
  if (isLoading) return <LoadingState type="list" />;
  if (loadError !== undefined) {
    return (
      <ErrorState
        title="Could not load chapters"
        message={loadError}
        {...(onRetry === undefined ? {} : { onRetry })}
      />
    );
  }
  return <EmptyState type="no-chapters" />;
}

function isFirstVisibleChapter(chapters: readonly Chapter[], chapter: Chapter): boolean {
  return !chapters.some((item) => item.index < chapter.index && item.id !== chapter.id);
}

/** The one-line state summary above the list. */
function chapterSummaryText(isLoading: boolean, unreadCount: number, chapterCount: number): string {
  if (isLoading && chapterCount === 0) return 'Loading chapters…';
  if (unreadCount > 0) return `${unreadCount} unread`;
  return chapterCount === 0 ? 'No chapters from this source yet.' : 'All chapters read.';
}

interface ChapterRowsProps {
  readonly rows: readonly ChapterListRow[];
  readonly totalCount: number;
  readonly mappingChapters: readonly Chapter[];
  readonly readIds: ReadonlySet<ChapterId>;
  readonly downloaded: ReadonlySet<ChapterId>;
  readonly containerRef: RefObject<HTMLOListElement | null>;
  readonly isVirtualized: boolean;
  readonly totalSize: number;
  readonly isPending: boolean;
  onOpenChapter: (chapterId: ChapterId) => void;
  onSetChapterRead: ((chapterId: ChapterId, read: boolean) => Promise<void> | void) | undefined;
  onMarkPreviousRead: ((chapterId: ChapterId) => Promise<void> | void) | undefined;
  run: (action: () => Promise<void> | void) => void;
}

/** The list box: plain flow rows, or absolutely positioned rows in a window. */
function ChapterRows({
  rows,
  totalCount,
  mappingChapters,
  readIds,
  downloaded,
  containerRef,
  isVirtualized,
  totalSize,
  isPending,
  onOpenChapter,
  onSetChapterRead,
  onMarkPreviousRead,
  run,
}: ChapterRowsProps) {
  return (
    <ol
      ref={containerRef}
      aria-label="Chapters"
      data-virtualized={isVirtualized ? '' : undefined}
      className={cn(
        'rounded-box border border-border',
        // Windowed rows are absolutely positioned inside the list; the list
        // keeps the full scroll height from the virtualizer's total size.
        isVirtualized ? 'relative' : 'divide-y divide-border',
      )}
      {...(isVirtualized ? { style: { height: totalSize } } : {})}
    >
      {rows.map(({ key, chapter, position, dataIndex, measure, style }) => (
        <li
          key={key}
          data-index={dataIndex}
          ref={measure}
          style={style}
          aria-setsize={totalCount}
          aria-posinset={position + 1}
          className={cn(
            'flex items-center gap-2 px-2 sm:px-4',
            isVirtualized && 'border-t border-border',
          )}
        >
          <ChapterRowContent
            chapter={chapter}
            isFirst={isFirstVisibleChapter(mappingChapters, chapter)}
            isRead={readIds.has(chapter.id)}
            isDownloaded={downloaded.has(chapter.id)}
            isPending={isPending}
            onOpenChapter={onOpenChapter}
            onSetChapterRead={onSetChapterRead}
            onMarkPreviousRead={onMarkPreviousRead}
            run={run}
          />
        </li>
      ))}
    </ol>
  );
}

interface ChapterBodyProps extends Omit<ChapterRowsProps, 'totalCount'> {
  readonly chapterCount: number;
  readonly visibleCount: number;
  readonly filter: ChapterFilter;
  readonly isLoading: boolean;
  readonly loadError: string | undefined;
  onRetryLoad: (() => void) | undefined;
}

/** Empty, filtered-empty or rows: one of the three list states. */
function ChapterBody({
  chapterCount,
  visibleCount,
  filter,
  isLoading,
  loadError,
  onRetryLoad,
  ...rows
}: ChapterBodyProps) {
  if (chapterCount === 0) {
    return <ChapterListEmpty isLoading={isLoading} loadError={loadError} onRetry={onRetryLoad} />;
  }
  if (visibleCount === 0) {
    return (
      <p className="rounded-box border border-border px-4 py-6 text-sm text-muted-foreground">
        {filter === 'unread' ? 'No unread chapters.' : 'No read chapters yet.'}
      </p>
    );
  }
  return <ChapterRows {...rows} totalCount={visibleCount} />;
}

export function MangaChapterList({
  chapters,
  readStates,
  downloadedChapterIds = [],
  mappingId,
  lastReadChapterId,
  isPending = false,
  isLoading = false,
  loadError,
  onOpenChapter,
  onRetryLoad,
  onSetChapterRead,
  onMarkPreviousRead,
}: MangaChapterListProps) {
  const [sort, setSort] = useState<ChapterSort>('number');
  const [filter, setFilter] = useState<ChapterFilter>('all');
  const [error, setError] = useState<string | undefined>();

  const mappingChapters = chaptersForMapping(chapters, mappingId);
  const readIds = readChapterIds(readStates);
  const unreadCount = countUnreadChapters(mappingChapters, readIds);
  const visibleChapters = selectChapters(chapters, { mappingId, sort, filter, readIds });
  const lastReadChapter = chapters.find((chapter) => chapter.id === lastReadChapterId);
  const downloaded = new Set(downloadedChapterIds);
  const {
    containerRef,
    isVirtualized,
    scrollMargin,
    totalSize,
    rows: virtualRows,
    measureRow,
  } = useChapterVirtualizer(visibleChapters.length);

  const listRows = buildChapterRows(visibleChapters, {
    rows: virtualRows,
    scrollMargin,
    measureRow,
    isVirtualized,
  });

  function run(action: () => Promise<void> | void): void {
    setError(undefined);
    void Promise.resolve(action()).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not update reading state.');
    });
  }

  return (
    <section aria-label="Chapters" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Chapters</h2>
          <p className="text-sm text-muted-foreground" data-testid="chapter-summary">
            {chapterSummaryText(isLoading, unreadCount, mappingChapters.length)}
            {lastReadChapter !== undefined ? ` · Last read: ${lastReadChapter.title}` : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <fieldset
            aria-label="Filter chapters"
            className="m-0 flex min-w-0 items-center gap-1 rounded-control border border-border p-1"
          >
            {FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? 'default' : 'ghost'}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </fieldset>
          <Select value={sort} onValueChange={(value) => setSort(value as ChapterSort)}>
            <SelectTrigger aria-label="Sort chapters" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ChapterBody
        chapterCount={mappingChapters.length}
        visibleCount={visibleChapters.length}
        filter={filter}
        isLoading={isLoading}
        loadError={loadError}
        onRetryLoad={onRetryLoad}
        rows={listRows}
        mappingChapters={mappingChapters}
        readIds={readIds}
        downloaded={downloaded}
        containerRef={containerRef}
        isVirtualized={isVirtualized}
        totalSize={totalSize}
        isPending={isPending}
        onOpenChapter={onOpenChapter}
        onSetChapterRead={onSetChapterRead}
        onMarkPreviousRead={onMarkPreviousRead}
        run={run}
      />
    </section>
  );
}
