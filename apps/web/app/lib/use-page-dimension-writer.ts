import { useCallback, useRef } from 'react';
import { updateChapterPageDimensions, type AppDrizzleDb } from '@app/db';
import type { ChapterId } from '@app/shared';
import { feedback } from './app-feedback.js';

export const PAGE_DIMENSIONS_WRITE_DELAY_MS = 300;

/**
 * Stores decoded page sizes for one chapter, coalesced. The timer outlives
 * unmount, like the settings writer: leaving the reader must not drop the last
 * sizes. A size already written in this mount is not written again.
 */
export function usePageDimensionWriter({
  chapterId,
  db,
}: {
  readonly chapterId: ChapterId;
  readonly db: AppDrizzleDb | null;
}): {
  readonly write: (
    dimensions: readonly {
      readonly pageIndex: number;
      readonly width: number;
      readonly height: number;
    }[],
    immediate: boolean,
  ) => void;
} {
  const pending = useRef(new Map<number, { pageIndex: number; width: number; height: number }>());
  const known = useRef(new Map<number, { pageIndex: number; width: number; height: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const write = useCallback(
    (
      dimensions: readonly {
        readonly pageIndex: number;
        readonly width: number;
        readonly height: number;
      }[],
      immediate: boolean,
    ) => {
      let queued = false;
      for (const dimension of dimensions) {
        const seen = known.current.get(dimension.pageIndex);
        if (
          seen !== undefined &&
          seen.width === dimension.width &&
          seen.height === dimension.height
        ) {
          continue;
        }
        known.current.set(dimension.pageIndex, dimension);
        pending.current.set(dimension.pageIndex, dimension);
        queued = true;
      }
      if (!queued) return;
      if (immediate) {
        flush();
        return;
      }
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, PAGE_DIMENSIONS_WRITE_DELAY_MS);
    },
    [flush],
  );

  return { write };
}
