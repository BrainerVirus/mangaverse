/**
 * Reader timing marks, recorded on the browser's performance timeline so the
 * reader's own log (devtools, an E2E run) can answer the two budgets: a cached
 * page turn to paint, and a chapter open to its first page.
 *
 * Marks are cheap and bounded by the browser's performance buffer; nothing here
 * allocates React state or blocks a frame.
 */
export interface ReaderTimingDetail {
  readonly pageIndex: number;
  readonly fromCache?: boolean;
}

const PAGE_TURN_START = 'reader:page-turn:start';
const CHAPTER_OPEN_START = 'reader:chapter-open:start';

/**
 * `performance.measure` throws when its start mark is gone, so the mark is
 * checked first. A cancelled turn then records nothing instead of breaking the
 * navigation that cancelled it.
 */
function safeMeasure(name: string, startMark: string, detail?: ReaderTimingDetail): number | null {
  if (typeof performance === 'undefined') return null;
  if (performance.getEntriesByName(startMark, 'mark').length === 0) return null;
  const startedAt = performance.now();
  performance.measure(name, { start: startMark, detail: detail ?? {} });
  performance.clearMarks(startMark);
  return performance.getEntriesByName(name, 'measure').at(-1)?.duration ?? startedAt;
}

/** Called when a navigation requests the new page, before React state moves. */
export function markReaderPageTurn(): void {
  if (typeof performance === 'undefined') return;
  performance.mark(PAGE_TURN_START);
}

/** Called once the requested page's image has loaded and the next frame ran. */
export function endReaderPageTurn(detail: ReaderTimingDetail): number | null {
  return safeMeasure('reader:page-turn', PAGE_TURN_START, detail);
}

/** Called once when a chapter's data (and therefore its first page) exists. */
export function markReaderChapterOpen(): void {
  if (typeof performance === 'undefined') return;
  performance.mark(CHAPTER_OPEN_START);
}

/** Called after the first page paints. */
export function endReaderChapterOpen(detail: ReaderTimingDetail): number | null {
  return safeMeasure('reader:chapter-open', CHAPTER_OPEN_START, detail);
}
