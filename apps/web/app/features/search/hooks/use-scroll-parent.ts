import { useLayoutEffect, useState, type RefObject } from 'react';
import { findScrollParent } from '../find-scroll-parent.js';

export function useScrollParent(targetRef: RefObject<HTMLElement | null>): HTMLElement | null {
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = targetRef.current;
    if (!element) {
      setScrollParent(null);
      return;
    }

    setScrollParent(findScrollParent(element));
  }, [targetRef]);

  return scrollParent;
}
