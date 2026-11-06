import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useStateReducer } from '@app/design-system';
import type { AppDrizzleDb } from '@app/db';
import {
  applyPageShapeDecision,
  isUsableMeasurement,
  pageHasSize,
  readerQueryKeys,
  resolveAutoStripSwitch,
  type PageShapeDecision,
  type ReaderPageData,
  type ReaderPageMeasurement,
} from '@app/reader';
import type { ChapterId } from '@app/shared';
import { usePageDimensionWriter } from './use-page-dimension-writer.js';

export { PAGE_DIMENSIONS_WRITE_DELAY_MS } from './use-page-dimension-writer.js';

/**
 * Takes the reader's decoded page sizes for one chapter (spec R6). The first
 * decode may switch Auto to the strip for this open: the decision lives in
 * state, so a chapter refetch (which may read the old, size-less rows) cannot
 * undo it, and the session resolves again on the same page. Every new size is
 * stored, coalesced, so the next open resolves before paint.
 */
export function useReaderPageShape({
  chapterId,
  db,
  queryClient,
  data,
}: {
  readonly chapterId: ChapterId;
  readonly db: AppDrizzleDb | null;
  readonly queryClient: QueryClient;
  /** The raw chapter query data; the returned data carries the shape decision. */
  readonly data: ReaderPageData | null | undefined;
}): {
  readonly data: ReaderPageData | null | undefined;
  readonly onMeasured: (measurement: ReaderPageMeasurement) => void;
} {
  const [decision, setDecision] = useStateReducer<PageShapeDecision, PageShapeDecision>(
    (_current, next) => next,
    { decision: null, measurements: new Map() },
  );
  const { write } = usePageDimensionWriter({ chapterId, db });

  const onMeasured = useCallback(
    (measurement: ReaderPageMeasurement) => {
      if (!isUsableMeasurement(measurement)) return;
      if (data == null || data.chapterId !== chapterId) return;
      const page = data.chapter.pages.find((item) => item.index === measurement.pageIndex);
      if (page === undefined) return;

      // Only the first decode decides: a tall credits page met later in a
      // paged chapter must not turn it into a strip mid-read. The decision is
      // state, so a refetch cannot replace it with the old shape.
      const first = decision.decision === null;
      const switched = first ? resolveAutoStripSwitch(data, measurement) : undefined;
      if (first) {
        setDecision({
          decision: switched !== undefined ? 'strip' : 'paged',
          measurements:
            switched !== undefined ? new Map([[measurement.pageIndex, measurement]]) : new Map(),
        });
      } else if (decision.decision === 'strip') {
        const measurements = new Map(decision.measurements);
        measurements.set(measurement.pageIndex, measurement);
        setDecision({ decision: 'strip', measurements });
      }
      if (switched !== undefined) {
        queryClient.setQueryData(readerQueryKeys.chapter(chapterId), switched);
      }

      if (!pageHasSize(page, measurement)) {
        // The size that switched the reader is stored at once: a refetch of the
        // chapter before it lands would read the old shape.
        write(
          [
            {
              pageIndex: measurement.pageIndex,
              width: measurement.width,
              height: measurement.height,
            },
          ],
          switched !== undefined,
        );
      }
    },
    [chapterId, data, decision, queryClient, setDecision, write],
  );

  return {
    data: data == null ? data : applyPageShapeDecision(data, decision),
    onMeasured,
  };
}
