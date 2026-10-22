import { useCallback, useEffect, useRef } from 'react';
import {
  createProgressEvent,
  shouldCheckpointOnUnmount,
  shouldPersistProgress,
} from '../progress.js';
import type { ReaderPageData } from '../reader-page-data.js';
import type { ReaderProgressEvent, ReaderState } from '../types.js';

const PROGRESS_DEBOUNCE_MS = 750;

/**
 * Debounced progress persistence plus the unmount checkpoint. The timer and
 * pending event stay in refs: they are high-frequency reader state, not render
 * state.
 */
export function useReaderProgress(
  data: ReaderPageData | undefined,
  readerState: ReaderState | null,
  onPersistProgress: ((event: ReaderProgressEvent) => void) | undefined,
): { readonly cancelPendingCheckpoint: () => void } {
  const lastPersistedRef = useRef<ReaderProgressEvent | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEventRef = useRef<ReaderProgressEvent | null>(null);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: debounced persistence is a timer, and the effect owns its cancel
  useEffect(() => {
    if (!data || !readerState || !onPersistProgress) return;
    // Nothing to read yet (provider pages are still hydrating): page 0 with
    // zero pages would mark the chapter complete and overwrite saved progress.
    if (data.chapter.pageCount === 0) return;

    const nextEvent = createProgressEvent(
      data.chapterId,
      data.mangaId,
      readerState.activePageIndex,
      data.chapter.pageCount,
    );

    const previous = lastPersistedRef.current;
    // A completed chapter marked from the chapter list may never have had its
    // pages hydrated, so it resumes on page 1. Opening it must not write page 1
    // as incomplete progress and undo the completion.
    if (previous === null && data.initialCompleted === true) {
      lastPersistedRef.current = {
        chapterId: data.chapterId,
        mangaId: data.mangaId,
        pageIndex: readerState.activePageIndex,
        readPercent: 100,
        completed: true,
        timestamp: new Date(0).toISOString(),
      };
      return;
    }
    if (
      previous !== null &&
      !shouldPersistProgress(previous, nextEvent, { minPagesBetweenPersists: 1 })
    ) {
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
  const onPersistRef = useRef(onPersistProgress);
  const mountedAtRef = useRef(0);

  // Latest-value refs are written after commit, not while rendering
  // (react/refs); the unmount checkpoint below only runs after a commit, so it
  // always sees the values of the last committed render.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- after-commit ref sync: the unmount checkpoint must see the last committed props, and writing a ref while rendering would be the same rule this replaces
  useEffect(() => {
    initialIndexRef.current = data?.initialPageIndex ?? 0;
    onPersistRef.current = onPersistProgress;
  });

  // react-doctor-disable-next-line team-conventions/no-use-effect -- mount-only clock read; a lazy ref initializer would run on every render and date the reader from the wrong moment
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the unmount checkpoint flushes the timer the debounce above cleared
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

  /**
   * An explicit mark read/unread is newer than the page the reader opened on;
   * a pending checkpoint would write that page back with a later timestamp.
   */
  const cancelPendingCheckpoint = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingEventRef.current = null;
  }, []);

  return { cancelPendingCheckpoint };
}
