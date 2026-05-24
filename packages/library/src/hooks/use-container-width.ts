import { useLayoutEffect, useState, type RefObject } from 'react';

export function useContainerWidth(targetRef: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = targetRef.current;
    if (!element) {
      setWidth(0);
      return;
    }

    const updateWidth = () => {
      setWidth(element.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [targetRef]);

  return width;
}
