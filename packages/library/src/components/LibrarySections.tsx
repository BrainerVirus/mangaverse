import { Badge, Button } from '@app/design-system';
import { CachedMangaCardCover } from '@app/cache';
import type { ChapterId, LibraryEntryId, MangaId } from '@app/shared';
import { libraryStatusLabel } from '@app/shared';
import { RefreshCw } from 'lucide-react';
import type { LibraryOverviewItem } from '../fetch-library-overview.js';
import type { LibraryUpdateItem, LibraryUpdateReport } from '../update-queue.js';

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

function progressLabel(percent: number | undefined): string | undefined {
  if (percent === undefined) return undefined;
  return `${Math.round(Math.min(100, Math.max(0, percent)))}% read`;
}

interface CoverThumbProps {
  item: LibraryOverviewItem;
}

function CoverThumb({ item }: CoverThumbProps) {
  return (
    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-control bg-muted">
      <CachedMangaCardCover manga={item.item.manga} className="h-full w-full object-cover" />
    </div>
  );
}

export interface ContinueReadingSectionProps {
  readonly items: readonly LibraryOverviewItem[];
  readonly onResume: (chapterId: ChapterId) => void;
  /** Render the empty message; hidden silently under an active filter. */
  readonly showEmpty?: boolean;
}

/** Resumes the exact chapter the reader last touched, from local data only. */
export function ContinueReadingSection({
  items,
  onResume,
  showEmpty = false,
}: ContinueReadingSectionProps) {
  if (items.length === 0 && !showEmpty) return null;

  return (
    <section aria-label="Continue reading" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Continue reading</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing in progress yet. Open a chapter from your library to start.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const chapter = item.lastReadChapter;
            const progress = progressLabel(item.item.entry.progressPercent);
            return (
              <li key={item.item.entry.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-box border border-border bg-card p-3 text-left transition-colors hover:border-accent hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    if (chapter !== undefined) onResume(chapter.id);
                  }}
                  disabled={chapter === undefined}
                >
                  <CoverThumb item={item} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{item.item.manga.canonicalTitle}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {chapter?.title ?? 'Chapter no longer available'}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {libraryStatusLabel(item.item.entry.status)}
                      </Badge>
                      {progress !== undefined ? <span>{progress}</span> : null}
                      {item.unreadCount > 0 ? <span>{item.unreadCount} unread</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export interface RecentlyUpdatedSectionProps {
  readonly items: readonly LibraryOverviewItem[];
  readonly onOpenManga: (mangaId: MangaId) => void;
}

/**
 * Titles with chapters past the last read one, newest persisted chapter first.
 * Times come from stored chapter rows; a title with no timestamp shows none.
 */
export function RecentlyUpdatedSection({ items, onOpenManga }: RecentlyUpdatedSectionProps) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Recently updated" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Recently updated</h2>
      <ul className="divide-y divide-border rounded-box border border-border bg-card">
        {items.map((item) => {
          const latest = item.latestChapter;
          const updatedAt =
            latest === undefined ? undefined : (latest.publishedAt ?? latest.addedAt);
          return (
            <li key={item.item.entry.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpenManga(item.item.manga.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {item.item.manga.canonicalTitle}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {latest === undefined ? 'No chapters yet' : `Latest: ${latest.title}`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {item.unreadCount > 0 ? <Badge>{item.unreadCount} new</Badge> : null}
                  {item.lastReadChapter !== undefined ? (
                    <span>Read: {item.lastReadChapter.title}</span>
                  ) : (
                    <span>Not started</span>
                  )}
                  {updatedAt !== undefined ? (
                    <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface LibraryUpdatesControl {
  readonly status: 'idle' | 'running';
  readonly report: LibraryUpdateReport | undefined;
  readonly onCheck: () => void;
  readonly onCancel: () => void;
  /** Runs the check again for the given titles only. */
  readonly onRetry: (entryIds: readonly LibraryEntryId[]) => void;
  /** Drops the last report from the settings row and the panel. */
  readonly onClearReport: () => void;
}

export interface LibraryUpdatePanelProps {
  readonly updates: LibraryUpdatesControl;
}

function isProblem(item: LibraryUpdateItem): boolean {
  return item.status === 'failed' || item.status === 'skipped';
}

function summarize(report: LibraryUpdateReport | undefined, running: boolean): string {
  if (running) {
    const items = report?.items ?? [];
    const counts = [
      ['queued', 'queued'],
      ['running', 'running'],
      ['done', 'done'],
      ['failed', 'failed'],
      ['skipped', 'skipped'],
      ['cancelled', 'cancelled'],
    ] as const;
    const parts = counts
      .map(([status, label]) => ({
        label,
        count: items.filter((item) => item.status === status).length,
      }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.count} ${entry.label}`);
    return `Checking for updates… ${parts.length === 0 ? 'starting' : parts.join(' · ')}.`;
  }
  if (report === undefined) return 'Check your providers for new chapters.';

  const checked = report.items.filter((item) => item.status === 'done').length;
  const newChapters = report.items.reduce((sum, item) => sum + item.newChapterCount, 0);
  const updatedChapters = report.items.reduce((sum, item) => sum + item.updatedChapterCount, 0);
  const failed = report.items.filter((item) => item.status === 'failed').length;
  const skipped = report.items.filter((item) => item.status === 'skipped').length;
  const parts = [
    `${checked} checked`,
    newChapters === 1 ? '1 new chapter' : `${newChapters} new chapters`,
  ];
  if (updatedChapters > 0) {
    parts.push(updatedChapters === 1 ? '1 updated chapter' : `${updatedChapters} updated chapters`);
  }
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `${report.status === 'cancelled' ? 'Cancelled · ' : ''}${parts.join(' · ')}`;
}

/** User-triggered library update check: progress, cancel and the failure report. */
export function LibraryUpdatePanel({ updates }: LibraryUpdatePanelProps) {
  const { report, status, onCheck, onCancel, onRetry, onClearReport } = updates;
  const running = status === 'running';
  const problems = (report?.items ?? []).filter(isProblem);
  const failed = problems.filter((item) => item.status === 'failed');

  return (
    <section
      aria-label="Library updates"
      className="flex flex-col gap-3 rounded-box border border-border bg-card/60 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Updates</h2>
          <output aria-live="polite" className="block text-sm text-muted-foreground">
            {summarize(report, running)}
          </output>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel updates
            </Button>
          ) : null}
          {!running && failed.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRetry(failed.map((item) => item.entryId))}
            >
              Retry failed
            </Button>
          ) : null}
          {!running && report !== undefined ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClearReport}>
              Clear report
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onCheck} disabled={running}>
            <RefreshCw aria-hidden className="size-4" />
            Check for updates
          </Button>
        </div>
      </div>

      {problems.length > 0 ? (
        <ul aria-label="Update failures" className="flex flex-col gap-2">
          {problems.map((item) => (
            <li
              key={item.entryId}
              className="flex flex-wrap items-start justify-between gap-2 rounded-control bg-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.providerId ?? 'No provider'} ·{' '}
                  {item.status === 'skipped' ? 'Skipped' : 'Failed'}
                  {item.reason === undefined ? '' : `: ${item.reason}`}
                </p>
              </div>
              {item.status === 'failed' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={running}
                  onClick={() => onRetry([item.entryId])}
                >
                  Retry
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
