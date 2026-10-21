import { useLayoutEffect, useState } from 'react';
import type { ReaderViewport } from '../types.js';

const DEFAULT_VIEWPORT: ReaderViewport = {
  width: 800,
  height: 600,
  orientation: 'landscape',
};

/**
 * The reader surface reports its own box, not the window's: the surface only
 * renders after loading, so a callback ref (not a mount effect) is what keeps
 * the measured viewport on the real container — a mount effect with `[]` deps
 * ran while the ref was still null and never observed it.
 *
 * The measurement is a layout effect so it is flushed with the commit, before
 * the browser paints: the first visible frame is fitted to the real box
 * instead of the 800x600 default (a passive effect ran after that paint).
 */
export function useReaderViewport(): {
  readonly containerRef: (node: HTMLDivElement | null) => void;
  /** The measured surface node, for code that needs the box, not just its size. */
  readonly surface: HTMLDivElement | null;
  readonly viewport: ReaderViewport;
} {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<ReaderViewport>(DEFAULT_VIEWPORT);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: the viewport follows the DOM node's ResizeObserver
  useLayoutEffect(() => {
    if (!node) return;

    const update = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      // An unmeasurable node (jsdom, a hidden container) keeps the default
      // viewport instead of collapsing every fit box to zero.
      if (width <= 0 || height <= 0) return;
      // An unchanged box keeps the previous object: a fresh viewport rebuilds
      // the session (and resets zoom) even when nothing moved.
      setViewport((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height, orientation: width >= height ? 'landscape' : 'portrait' },
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { containerRef: setNode, surface: node, viewport };
}
