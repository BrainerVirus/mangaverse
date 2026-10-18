import { useEffect, type RefObject } from 'react';

export function useInfiniteScrollSentinel(
  sentinelRef: RefObject<Element | null>,
  onLoadMore: (() => void) | undefined,
  enabled: boolean,
): void {
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: an IntersectionObserver on the sentinel node
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !enabled || onLoadMore === undefined) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { rootMargin: '240px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onLoadMore, sentinelRef]);
}
