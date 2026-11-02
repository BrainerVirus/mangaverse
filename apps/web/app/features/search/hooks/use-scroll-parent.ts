import { useLayoutEffect, useState, type RefObject } from 'react';
import { findScrollParent } from '../find-scroll-parent.js';

export interface ScrollParentState {
  readonly scrollParent: HTMLElement | null;
  /** False until the container has been measured once; null then only means "no scroll ancestor". */
  readonly isMeasured: boolean;
}

export function useScrollParent(targetRef: RefObject<HTMLElement | null>): ScrollParentState {
  const [state, setState] = useState<ScrollParentState>({
    scrollParent: null,
    isMeasured: false,
  });

  useLayoutEffect(() => {
    const element = targetRef.current;
    if (!element) {
      return;
    }

    setState({ scrollParent: findScrollParent(element), isMeasured: true });
  }, [targetRef]);

  return state;
}
