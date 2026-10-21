import { useEffect, useState } from 'react';
import { resolveKeyboardAction, resolveWheelAction } from '../navigation.js';
import { computeScrollTargetTop, resolveVerticalNavigationTarget } from '../scroll-navigation.js';
import { applyPinchZoom, clampZoomTransform } from '../zoom.js';
import type { ReaderNavigationAction, ReaderSessionInput, ZoomStateSummary } from '../types.js';
import type { ReaderScrollViewHandle } from './ReaderScrollView.js';

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
  verticalTargetPending,
}: {
  readonly sessionInput: ReaderSessionInput | null;
  readonly navigate: (action: ReaderNavigationAction) => void;
  readonly reducedMotion: boolean;
  readonly scrollHandle: { readonly current: ReaderScrollViewHandle | null };
  readonly verticalTarget: { current: number };
  readonly verticalTargetPending: { current: boolean };
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
        const target = resolveVerticalNavigationTarget(verticalTarget.current, action, pageCount);
        verticalTarget.current = target;
        verticalTargetPending.current = true;
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
  }, [navigate, reducedMotion, scrollHandle, sessionInput, verticalTarget, verticalTargetPending]);
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

    // Trackpads send many small deltas per frame; queue them and apply the whole
    // burst against one measured box in one state commit. Sequential
    // application keeps the result identical to applying each event alone.
    let rect = zoomLayer.getBoundingClientRect();
    let steps: { readonly delta: number; readonly x: number; readonly y: number }[] = [];
    let frame: number | null = null;

    const flush = () => {
      frame = null;
      const pending = steps;
      steps = [];
      if (pending.length === 0) return;
      updateZoom((zoom) => {
        let next = zoom;
        for (const step of pending) {
          next = clampZoomTransform(
            // One ~100px wheel notch is ~22%; trackpads send many small deltas.
            applyPinchZoom(next, next.scale, next.scale * Math.exp(-step.delta * 0.002), {
              centerX: step.x,
              centerY: step.y,
            }),
            rect.width,
            rect.height,
            rect.width,
            rect.height,
          );
        }
        return next;
      });
    };

    const handleWheel = (event: WheelEvent) => {
      const action = resolveWheelAction(event, sessionInput.settings);
      if (action.type !== 'zoom') return;
      event.preventDefault();
      steps.push({
        delta: action.delta ?? 0,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      frame ??= window.requestAnimationFrame(flush);
    };

    const observer = new ResizeObserver(() => {
      rect = zoomLayer.getBoundingClientRect();
    });
    observer.observe(zoomLayer);
    zoomLayer.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      zoomLayer.removeEventListener('wheel', handleWheel);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- updateZoom is read by the deferred frame flush, not in the effect body
  }, [sessionInput, updateZoom, zoomLayer]);

  return { zoomLayerRef: setZoomLayer };
}
