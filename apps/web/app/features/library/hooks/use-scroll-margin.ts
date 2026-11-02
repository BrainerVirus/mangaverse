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
 * before it can map a scroll position to a row index. Listening to scroll is
 * pointless here: the offset does not change while scrolling, so the hook
 * re-measures only when the container or the scroll parent resizes.
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
    window.addEventListener('resize', updateMargin);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMargin);
    };
  }, [containerRef, scrollParent]);

  return margin;
}
