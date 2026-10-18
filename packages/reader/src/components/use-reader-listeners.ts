import { useEffect, useState } from 'react';
import { resolveKeyboardAction, resolveWheelAction } from '../navigation.js';
import { computeScrollTargetTop, resolveVerticalNavigationTarget } from '../scroll-navigation.js';
import { applyPinchZoom, clampZoomTransform } from '../zoom.js';
import type { ReaderNavigationAction, ReaderSessionInput, ZoomStateSummary } from '../types.js';
import type { ReaderScrollViewHandle } from './ReaderScrollView.js';

/** The vertical target refs, read and written by the key handler and by scroll. */
export interface VerticalTargetRefs {
  readonly target: { current: number };
  readonly pending: { current: boolean };
}

/**
 * Keyboard navigation. The paged layer is the default; the continuous strip
 * resolves its target from the last press instead of the centre-based active
 * page, because during a smooth scroll the active page lags behind and rapid
 * presses would otherwise all resolve to the same index.
 */
export function useReaderKeyboard({
  sessionInput,
  navigate,
  reducedMotion,
  scrollHandle,
  verticalTarget,
}: {
  readonly sessionInput: ReaderSessionInput | null;
  readonly navigate: (action: ReaderNavigationAction) => void;
  readonly reducedMotion: boolean;
  readonly scrollHandle: { readonly current: ReaderScrollViewHandle | null };
  readonly verticalTarget: VerticalTargetRefs;
}): void {
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: a window-level keydown listener, bound and unbound with the session
  useEffect(() => {
    if (!sessionInput) return;

    const pageCount = sessionInput.chapter.pageCount;
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveKeyboardAction(event, sessionInput.settings);
      if (action.type === 'none') return;
      event.preventDefault();
      if (sessionInput.settings.readingMode === 'vertical') {
        // In the continuous strip, navigation moves the scroll position to the
        // target page's centre; the target advances on the press itself, so a
        // burst of presses is never resolved from a stale (centre-based) index.
        const handle = scrollHandle.current;
        const target = resolveVerticalNavigationTarget(
          verticalTarget.target.current,
          action,
          pageCount,
        );
        verticalTarget.target.current = target;
        verticalTarget.pending.current = true;
        if (!handle) return;
        const container = handle.scrollContainer();
        if (container === null) return;
        container.scrollTo({
          top: computeScrollTargetTop(
            handle.measurePages(),
            target,
            container.clientHeight,
            container.scrollHeight,
          ),
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
        return;
      }
      navigate(action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, reducedMotion, scrollHandle, sessionInput, verticalTarget]);
}

/**
 * Ctrl+wheel zoom (wheelBehavior 'zoom'). The paged layer owns the listener, so
 * the scroll strip keeps native wheel scrolling, and passive: false lets the
 * handler cancel the browser's own page zoom.
 */
export function useReaderWheelZoom({
  sessionInput,
  updateZoom,
}: {
  readonly sessionInput: ReaderSessionInput | null;
  readonly updateZoom: (transform: (zoom: ZoomStateSummary) => ZoomStateSummary) => void;
}): { readonly zoomLayerRef: (node: HTMLDivElement | null) => void } {
  const [zoomLayer, setZoomLayer] = useState<HTMLDivElement | null>(null);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: a non-passive wheel listener on the zoom layer
  useEffect(() => {
    if (zoomLayer === null || sessionInput === null) return;

    const handleWheel = (event: WheelEvent) => {
      const action = resolveWheelAction(event, sessionInput.settings);
      if (action.type !== 'zoom') return;
      event.preventDefault();
      const rect = zoomLayer.getBoundingClientRect();
      // One ~100px wheel notch is ~22%; trackpads send many small deltas.
      updateZoom((zoom) =>
        clampZoomTransform(
          applyPinchZoom(zoom, zoom.scale, zoom.scale * Math.exp(-(action.delta ?? 0) * 0.002), {
            centerX: event.clientX - rect.left,
            centerY: event.clientY - rect.top,
          }),
          rect.width,
          rect.height,
          rect.width,
          rect.height,
        ),
      );
    };

    zoomLayer.addEventListener('wheel', handleWheel, { passive: false });
    return () => zoomLayer.removeEventListener('wheel', handleWheel);
  }, [sessionInput, updateZoom, zoomLayer]);

  return { zoomLayerRef: setZoomLayer };
}
