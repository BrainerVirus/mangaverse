import { useEffect, useRef } from 'react';
import { createProgressEvent, shouldCheckpointOnUnmount, shouldPersistProgress } from '../progress.js';
import type { ReaderPageData } from '../reader-page-data.js';
import type { ReaderProgressEvent, ReaderState } from '../types.js';

export const PROGRESS_DEBOUNCE_MS = 750;

/**
 * Debounced progress persistence plus the unmount checkpoint. The timer and
 * pending event stay in refs: they are high-frequency reader state, not render
 * state.
 */
export function useReaderProgress(
  data: ReaderPageData | undefined,
  readerState: ReaderState | null,
  onPersistProgress: ((event: ReaderProgressEvent) => void) | undefined,
): void {
  const lastPersistedRef = useRef<ReaderProgressEvent | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEventRef = useRef<ReaderProgressEvent | null>(null);

  useEffect(() => {
    if (!data || !readerState || !onPersistProgress) return;

    const nextEvent = createProgressEvent(
      data.chapterId,
      data.mangaId,
      readerState.activePageIndex,
      data.chapter.pageCount,
    );

    const previous = lastPersistedRef.current;
    if (previous !== null && !shouldPersistProgress(previous, nextEvent, { minPagesBetweenPersists: 1 })) {
      return;
    }

    pendingEventRef.current = nextEvent;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      lastPersistedRef.current = nextEvent;
      pendingEventRef.current = null;
      onPersistProgress(nextEvent);
    }, PROGRESS_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [data, onPersistProgress, readerState]);

  // Navigating away must not drop the last page change: checkpoint the pending
  // event on unmount instead of leaving it to the cleared debounce timer. Refs
  // for the callback and initial index keep this effect unmount-only, and the
  // blip guard keeps a router transition remount (or a user pressing Back right
  // after opening) from persisting its initial page over newer progress.
  const initialIndexRef = useRef(0);
  initialIndexRef.current = data?.initialPageIndex ?? 0;
  const onPersistRef = useRef(onPersistProgress);
  onPersistRef.current = onPersistProgress;
  const mountedAtRef = useRef(Date.now());

  useEffect(
    () => () => {
      const pending = pendingEventRef.current;
      const persist = onPersistRef.current;
      if (pending === null || persist === undefined) return;

      const lifetimeMs = Date.now() - mountedAtRef.current;
      if (
        !shouldCheckpointOnUnmount(pending.pageIndex, {
          initialPageIndex: initialIndexRef.current,
          lifetimeMs,
          debounceMs: PROGRESS_DEBOUNCE_MS,
        })
      ) {
        return;
      }

      pendingEventRef.current = null;
      persist(pending);
    },
    [],
  );
}
