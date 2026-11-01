import { useState, type CSSProperties, type Key } from 'react';
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

  const listRows: readonly ChapterListRow[] = isVirtualized
    ? virtualRows.flatMap((row) => {
        const chapter = visibleChapters[row.index];
        if (chapter === undefined) return [];
        return [
          {
            key: row.key,
            chapter,
            position: row.index,
            dataIndex: row.index,
            measure: measureRow,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start - scrollMargin}px)`,
            },
          } satisfies ChapterListRow,
        ];
      })
    : visibleChapters.map((chapter, position) => ({
        key: chapter.id,
        chapter,
        position,
        dataIndex: undefined,
        measure: undefined,
        style: undefined,
      }));

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
            {isLoading && mappingChapters.length === 0
              ? 'Loading chapters…'
              : unreadCount === 0
                ? mappingChapters.length === 0
                  ? 'No chapters from this source yet.'
                  : 'All chapters read.'
                : `${unreadCount} unread`}
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

      {mappingChapters.length === 0 ? (
        <ChapterListEmpty isLoading={isLoading} loadError={loadError} onRetry={onRetryLoad} />
      ) : visibleChapters.length === 0 ? (
        <p className="rounded-box border border-border px-4 py-6 text-sm text-muted-foreground">
          {filter === 'unread' ? 'No unread chapters.' : 'No read chapters yet.'}
        </p>
      ) : (
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
          {listRows.map(({ key, chapter, position, dataIndex, measure, style }) => {
            const isRead = readIds.has(chapter.id);
            const isFirst = !mappingChapters.some(
              (item) => item.index < chapter.index && item.id !== chapter.id,
            );
            return (
              <li
                key={key}
                data-index={dataIndex}
                ref={measure}
                style={style}
                aria-setsize={visibleChapters.length}
                aria-posinset={position + 1}
                className={cn(
                  'flex items-center gap-2 px-2 sm:px-4',
                  isVirtualized && 'border-t border-border',
                )}
              >
                <ChapterRowContent
                  chapter={chapter}
                  isFirst={isFirst}
                  isRead={isRead}
                  isDownloaded={downloaded.has(chapter.id)}
                  isPending={isPending}
                  onOpenChapter={onOpenChapter}
                  onSetChapterRead={onSetChapterRead}
                  onMarkPreviousRead={onMarkPreviousRead}
                  run={run}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
