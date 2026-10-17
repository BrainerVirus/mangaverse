import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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

  const sessionInput = useMemo<ReaderSessionInput | null>(() => {
    if (!data) return null;
    return {
      chapter: data.chapter,
      viewport,
      settings: data.engineSettings,
      initialPageIndex: data.initialPageIndex,
    };
  }, [data, viewport]);

  const sessionChapterRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionInput) {
      // No state to rebuild: the returned state is derived as null below.
      // Clearing the chapter marker keeps a chapter that returns later counted
      // as fresh, exactly as the previous reset did.
      sessionChapterRef.current = null;
      return;
    }
    // Resize ticks recreate `sessionInput` with a new viewport object. Recreating
    // the state with the original initial index would jump the reader back to the
    // start (and drop the pending progress), so keep the current page for the same
    // chapter and only use `initialPageIndex` for first creation or a new chapter.
    const chapterChanged = sessionChapterRef.current !== sessionInput.chapter.id;
    sessionChapterRef.current = sessionInput.chapter.id;
    setReaderState((current) => {
      return createReaderState({
        ...sessionInput,
        initialPageIndex:
          chapterChanged || current === null
            ? (sessionInput.initialPageIndex ?? 0)
            : current.activePageIndex,
      });
    });
  }, [sessionInput]);

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
    // No chapter data means no session; deriving the null here keeps the effect
    // above free of a synchronous setState (react/set-state-in-effect).
    readerState: sessionInput === null ? null : readerState,
    setReaderState,
    navigate,
  };
}
