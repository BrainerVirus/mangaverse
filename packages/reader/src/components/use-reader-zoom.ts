import { useCallback, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ReaderState, ZoomStateSummary } from '../types.js';

export interface ReaderZoomController {
  /** The live zoom, including frames not yet committed to React state. */
  readonly read: () => ZoomStateSummary;
  /** Applies a transform to the layer and to the ref; no React render. */
  readonly apply: (transform: (zoom: ZoomStateSummary) => ZoomStateSummary) => void;
  /** Publishes the live zoom to React state once, at the end of a gesture. */
  readonly commit: () => void;
  /**
   * Callback ref for the paged zoom layer. The layer is a DOM node, not
   * render state: attaching applies the resting transform before the first
   * paint, and detaching just drops the reference.
   */
  readonly setZoomLayer: (node: HTMLDivElement | null) => void;
}

function applyZoomStyle(layer: HTMLDivElement | null, zoom: ZoomStateSummary): void {
  if (layer === null) return;
  layer.style.transform = `translate(${zoom.translateX}px, ${zoom.translateY}px) scale(${zoom.scale})`;
  layer.style.transformOrigin = 'top left';
  // A zoomed page owns the pointer again; at scale 1 the strip/browser pan wins.
  layer.style.touchAction = zoom.scale > 1 ? 'none' : 'pan-x pan-y';
}

/**
 * Owns the reader's zoom transform while a gesture is running. Pointer frames
 * write the layer's style directly (one write per animation frame) and never
 * enter React state; the gesture's last value is committed once on release.
 * That is what keeps a pinch from re-rendering the reader (and everything that
 * reads `readerState`) at 60 Hz.
 *
 * React stays the source of truth at rest: any committed state change (page
 * turn, mode change, settings) is mirrored onto the layer before paint, so a
 * re-render during a gesture cannot resurrect a stale transform.
 */
export function useReaderZoom({
  readerState,
  setReaderState,
}: {
  readonly readerState: ReaderState;
  readonly setReaderState: Dispatch<SetStateAction<ReaderState | null>>;
}): ReaderZoomController {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef<ZoomStateSummary>(readerState.zoom);
  // The value the layer currently shows. A state sync only re-applies the
  // transform when the committed zoom actually differs, so a page-turn render
  // at scale 1 does not fight a running gesture.
  const shownRef = useRef<ZoomStateSummary | null>(null);

  useLayoutEffect(() => {
    zoomRef.current = readerState.zoom;
    if (shownRef.current !== readerState.zoom) {
      shownRef.current = readerState.zoom;
      applyZoomStyle(layerRef.current, readerState.zoom);
    }
  }, [readerState]);

  const setZoomLayer = useCallback((node: HTMLDivElement | null) => {
    layerRef.current = node;
    shownRef.current = zoomRef.current;
    applyZoomStyle(node, zoomRef.current);
  }, []);

  const apply = useCallback((transform: (zoom: ZoomStateSummary) => ZoomStateSummary) => {
    const next = transform(zoomRef.current);
    if (next === zoomRef.current) return;
    zoomRef.current = next;
    shownRef.current = next;
    applyZoomStyle(layerRef.current, next);
  }, []);

  const commit = useCallback(() => {
    const zoom = zoomRef.current;
    setReaderState((previous) =>
      previous === null || previous.zoom === zoom ? previous : { ...previous, zoom },
    );
  }, [setReaderState]);

  const read = useCallback(() => zoomRef.current, []);

  return { read, apply, commit, setZoomLayer };
}
