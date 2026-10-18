import { useEffect, useState } from 'react';
import type { ReaderViewport } from '../types.js';

/**
 * The reader surface reports its own box, not the window's: the surface only
 * renders after loading, so a callback ref (not a mount effect) is what keeps
 * the measured viewport on the real container — an effect with `[]` deps ran
 * while the ref was still null and never observed it, leaving tap zones
 * computed against the 800x600 default.
 */
export function useReaderViewport(): {
  readonly containerRef: (node: HTMLDivElement | null) => void;
  readonly viewport: ReaderViewport;
} {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<ReaderViewport>({
    width: 800,
    height: 600,
    orientation: 'landscape',
  });

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the viewport follows the DOM node's ResizeObserver
  useEffect(() => {
    if (!node) return;

    const update = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      // An unmeasurable node (jsdom, a hidden container) keeps the default
      // viewport instead of collapsing every fit box to zero.
      if (width <= 0 || height <= 0) return;
      setViewport({
        width,
        height,
        orientation: width >= height ? 'landscape' : 'portrait',
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { containerRef: setNode, viewport };
}
