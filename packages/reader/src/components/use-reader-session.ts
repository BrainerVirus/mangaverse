import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { applyNavigationAction, resolveNavigationAction } from '../navigation.js';
import type { ReaderPageData } from '../reader-page-data.js';
import { createReaderState } from '../state.js';
import type {
  ReaderNavigationAction,
  ReaderSessionInput,
  ReaderState,
  ReaderViewport,
} from '../types.js';

export interface ReaderSession {
  sessionInput: ReaderSessionInput | null;
  readerState: ReaderState | null;
  setReaderState: Dispatch<SetStateAction<ReaderState | null>>;
  navigate: (action: ReaderNavigationAction) => void;
}

/**
 * Owns the reader session: the state built from the chapter, viewport and
 * settings, recreated only when the chapter changes (not on resize ticks).
 */
export function useReaderSession(
  data: ReaderPageData | undefined,
  viewport: ReaderViewport,
): ReaderSession {
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  // The session input the state below was built from. Keeping it as state lets
  // the rebuild be a guarded render update (react.dev, "You Might Not Need an
  // Effect" — adjusting state when a prop changes) instead of an effect: the
  // marker matches the input right after the update, so it converges.
  const [trackedInput, setTrackedInput] = useState<ReaderSessionInput | null>(null);

  const sessionInput = useMemo<ReaderSessionInput | null>(() => {
    if (!data) return null;
    return {
      chapter: data.chapter,
      viewport,
      settings: data.engineSettings,
      initialPageIndex: data.initialPageIndex,
    };
  }, [data, viewport]);

  if (trackedInput !== sessionInput) {
    setTrackedInput(sessionInput);
    setReaderState((current) => {
      if (!sessionInput) {
        // No state to rebuild: the returned state is derived as null below.
        return null;
      }
      // Resize ticks recreate `sessionInput` with a new viewport object. Recreating
      // the state with the original initial index would jump the reader back to the
      // start (and drop the pending progress), so keep the current page for the same
      // chapter and only use `initialPageIndex` for first creation or a new chapter.
      const sameChapter = current !== null && trackedInput?.chapter.id === sessionInput.chapter.id;
      // A chapter that was empty while its provider pages hydrated has no real
      // position yet; once pages exist it must resume at the saved page, not the
      // placeholder page 0 the empty session was built on.
      const filledAfterHydration =
        sameChapter && current.pages.length === 0 && sessionInput.chapter.pageCount > 0;
      return createReaderState({
        ...sessionInput,
        initialPageIndex:
          sameChapter && !filledAfterHydration
            ? current.activePageIndex
            : (sessionInput.initialPageIndex ?? 0),
      });
    });
  }

  const navigate = useCallback(
    (action: ReaderNavigationAction) => {
      if (!sessionInput) return;

      setReaderState((current) => {
        if (!current) return current;
        const resolved = resolveNavigationAction(current, action);
        const applied = applyNavigationAction(current, resolved);
        return createReaderState({
          ...sessionInput,
          initialPageIndex: applied.activePageIndex,
        });
      });
    },
    [sessionInput],
  );

  return {
    sessionInput,
    // No chapter data means no session: deriving the null here keeps the
    // returned state honest in the render that starts the rebuild above.
    readerState: sessionInput === null ? null : readerState,
    setReaderState,
    navigate,
  };
}
