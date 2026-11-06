import { useCallback, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  updateChapterPageDimensions,
  type AppDrizzleDb,
  type ChapterPageDimensions,
} from '@app/db';
import {
  isUsableMeasurement,
  pageHasSize,
  readerQueryKeys,
  resolveAutoStripSwitch,
  type ReaderPageData,
  type ReaderPageMeasurement,
} from '@app/reader';
import type { ChapterId } from '@app/shared';
import { feedback } from './app-feedback.js';

export const PAGE_DIMENSIONS_WRITE_DELAY_MS = 300;

/**
 * Takes the reader's decoded page sizes for one chapter (spec R6). The first
 * decode may switch Auto to the strip for this open: the measured shape goes
 * into the cached reader data and the session resolves again on the same page.
 * Every new size is stored, coalesced, so the next open resolves before paint.
 * The timer outlives unmount, like the settings writer: leaving the reader must
 * not drop the last sizes.
 */
export function useReaderPageShape({
  chapterId,
  db,
  queryClient,
}: {
  readonly chapterId: ChapterId;
  readonly db: AppDrizzleDb | null;
  readonly queryClient: QueryClient;
}): (measurement: ReaderPageMeasurement) => void {
  const pending = useRef(new Map<number, ChapterPageDimensions>());
  // What this mount stored or queued, so a page decoding again writes nothing.
  const known = useRef(new Map<number, ChapterPageDimensions>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decided = useRef(false);

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current.values()];
    pending.current.clear();
    if (db === null || batch.length === 0) return;
    // A lost size is not lost reading: the page measures again on the next
    // open. Log it rather than raise the reading-changes banner.
    void updateChapterPageDimensions(db, chapterId, batch).then(
      (result) => {
        if (!result.ok) feedback.log(result.error, 'reader page dimensions');
      },
      (error: unknown) => feedback.log(error, 'reader page dimensions'),
    );
  }, [chapterId, db]);

  return useCallback(
    (measurement: ReaderPageMeasurement) => {
      if (!isUsableMeasurement(measurement)) return;
      const key = readerQueryKeys.chapter(chapterId);
      const current = queryClient.getQueryData<ReaderPageData | null>(key);
      if (current == null || current.chapterId !== chapterId) return;
      const page = current.chapter.pages.find((item) => item.index === measurement.pageIndex);
      if (page === undefined) return;

      // Only the first decode decides: a tall credits page met later in a
      // paged chapter must not turn it into a strip mid-read.
      const switched = decided.current ? undefined : resolveAutoStripSwitch(current, measurement);
      decided.current = true;
      if (switched !== undefined) queryClient.setQueryData(key, switched);

      const seen = known.current.get(measurement.pageIndex);
      const unchanged =
        seen !== undefined
          ? seen.width === measurement.width && seen.height === measurement.height
          : pageHasSize(page, measurement);
      if (unchanged) return;
      const dimensions = {
        pageIndex: measurement.pageIndex,
        width: measurement.width,
        height: measurement.height,
      };
      known.current.set(measurement.pageIndex, dimensions);
      pending.current.set(measurement.pageIndex, dimensions);
      // The size that switched the reader is stored at once: a refetch of the
      // chapter before it lands would read the old shape and switch back.
      if (switched !== undefined) {
        flush();
        return;
      }
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, PAGE_DIMENSIONS_WRITE_DELAY_MS);
    },
    [chapterId, flush, queryClient],
  );
}
