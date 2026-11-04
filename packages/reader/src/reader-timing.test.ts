import { describe, expect, it } from 'vitest';
import {
  endReaderChapterOpen,
  endReaderPageTurn,
  markReaderChapterOpen,
  markReaderPageTurn,
} from './reader-timing.js';

const measures = (name: string): PerformanceEntry[] =>
  performance.getEntriesByName(name, 'measure');

describe('reader timing marks', () => {
  it('Given a page-turn mark, When the page ends, Then one measure carries the elapsed time and detail', () => {
    markReaderPageTurn();
    const duration = endReaderPageTurn({ pageIndex: 3, fromCache: true });

    expect(duration).not.toBeNull();
    expect(duration!).toBeGreaterThanOrEqual(0);
    const entries = measures('reader:page-turn');
    const last = entries.at(-1) as PerformanceMeasure | undefined;
    expect(last?.detail).toMatchObject({ pageIndex: 3, fromCache: true });
  });

  it('Given no start mark, When a turn ends, Then it reports nothing instead of throwing', () => {
    performance.clearMarks();
    expect(endReaderPageTurn({ pageIndex: 1 })).toBeNull();
  });

  it('Given a chapter open, When the first page paints, Then the open measure is recorded once per mark', () => {
    markReaderChapterOpen();
    expect(endReaderChapterOpen({ pageIndex: 0 })).not.toBeNull();
    // The mark is consumed, so a second end without a new open is a no-op.
    expect(endReaderChapterOpen({ pageIndex: 0 })).toBeNull();
  });
});
