import { useLayoutEffect, useState, type RefObject } from 'react';

export function useScrollMargin(
  containerRef: RefObject<HTMLElement | null>,
  scrollParent: HTMLElement | null,
): number {
  const [margin, setMargin] = useState(0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || scrollParent === null) {
      setMargin(0);
      return;
    }

    const updateMargin = () => {
      const containerRect = element.getBoundingClientRect();
      const scrollRect = scrollParent.getBoundingClientRect();
      setMargin(containerRect.top - scrollRect.top + scrollParent.scrollTop);
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
