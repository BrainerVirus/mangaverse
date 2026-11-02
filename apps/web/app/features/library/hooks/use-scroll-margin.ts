import { useLayoutEffect, useReducer, type RefObject } from 'react';

/** A measured offset only; a reducer keeps the hook free of `useState`. */
interface MarginAction {
  readonly type: 'set';
  readonly value: number;
}

function marginReducer(state: number, action: MarginAction): number {
  // Re-measuring on resize often reproduces the same offset; keep the identity.
  return action.value === state ? state : action.value;
}

/**
 * The container's offset inside its scroll parent, which a virtualizer needs
 * before it can map a scroll position to a row index. The offset does not change
 * when scrolling, but the layout above the container can change without either
 * box resizing (a bulk bar appearing, a shelf filling in), so a passive scroll
 * listener re-measures on the next scroll. Equal values keep the identity.
 */
export function useScrollMargin(
  containerRef: RefObject<HTMLElement | null>,
  scrollParent: HTMLElement | null,
): number {
  const [margin, setMargin] = useReducer(marginReducer, 0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || scrollParent === null) {
      setMargin({ type: 'set', value: 0 });
      return;
    }

    const updateMargin = () => {
      const containerRect = element.getBoundingClientRect();
      const scrollRect = scrollParent.getBoundingClientRect();
      setMargin({
        type: 'set',
        value: containerRect.top - scrollRect.top + scrollParent.scrollTop,
      });
    };

    updateMargin();

    const observer = new ResizeObserver(updateMargin);
    observer.observe(element);
    observer.observe(scrollParent);
    scrollParent.addEventListener('scroll', updateMargin, { passive: true });
    window.addEventListener('resize', updateMargin);

    return () => {
      observer.disconnect();
      scrollParent.removeEventListener('scroll', updateMargin);
      window.removeEventListener('resize', updateMargin);
    };
  }, [containerRef, scrollParent]);

  return margin;
}
