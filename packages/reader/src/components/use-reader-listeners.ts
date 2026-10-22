import { useEffect, useState } from 'react';
import { resolveKeyboardAction, resolveWheelAction } from '../navigation.js';
import { computeScrollTargetTop, resolveVerticalNavigationTarget } from '../scroll-navigation.js';
import { applyPinchZoom, clampZoomTransform } from '../zoom.js';
import { measureZoomBox } from './zoom-box.js';
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
  disabled = false,
  onClose,
  onToggleChrome,
  onToggleFullscreen,
  onPreviousChapter,
  onNextChapter,
}: {
  readonly sessionInput: ReaderSessionInput | null;
  readonly navigate: (action: ReaderNavigationAction) => void;
  readonly reducedMotion: boolean;
  readonly scrollHandle: { readonly current: ReaderScrollViewHandle | null };
  readonly verticalTarget: { current: number };
  readonly verticalTargetPending: { current: boolean };
  readonly disabled?: boolean;
  readonly onClose?: (() => void) | undefined;
  readonly onToggleChrome?: (() => void) | undefined;
  readonly onToggleFullscreen?: (() => void) | undefined;
  readonly onPreviousChapter?: (() => void) | undefined;
  readonly onNextChapter?: (() => void) | undefined;
}): void {
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: a window-level keydown listener, bound and unbound with the session
  useEffect(() => {
    const pageCount = sessionInput?.chapter.pageCount ?? 0;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
        return;
      }
      // Typing and slider/select keys belong to the control. Arrows on a focused
      // button still page: closing the settings sheet returns focus to its
      // trigger and must not deaden the reader.
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="slider"]',
        )
      )
        return;
      if (event.key === ' ' && target?.closest('button, a, [role="button"]')) return;
      if (!sessionInput) return;
      const action = resolveKeyboardAction(event, sessionInput.settings);
      if (action.type === 'none') return;

      if (action.type === 'toggleChrome') {
        if (!onToggleChrome) return;
        event.preventDefault();
        onToggleChrome();
        return;
      }
      if (action.type === 'toggleFullscreen') {
        if (!onToggleFullscreen) return;
        event.preventDefault();
        onToggleFullscreen();
        return;
      }
      if (action.type === 'prevChapter' || action.type === 'nextChapter') {
        const goToChapter = action.type === 'nextChapter' ? onNextChapter : onPreviousChapter;
        if (!goToChapter) return;
        event.preventDefault();
        goToChapter();
        return;
      }

      event.preventDefault();
      if (sessionInput.settings.readingMode === 'vertical') {
        if (action.type === 'nextPage' && verticalTarget.current >= pageCount - 1) {
          navigate(action);
          return;
        }
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
  }, [
    disabled,
    navigate,
    onClose,
    onNextChapter,
    onPreviousChapter,
    onToggleChrome,
    onToggleFullscreen,
    reducedMotion,
    scrollHandle,
    sessionInput,
    verticalTarget,
    verticalTargetPending,
  ]);
}

/**
 * Ctrl+wheel zoom (wheelBehavior 'zoom'). The paged layer owns the listener, so
 * the scroll strip keeps native wheel scrolling, and passive: false lets the
 * handler cancel the browser's own page zoom.
 */
export function useReaderWheelZoom({
  sessionInput,
  surface,
  updateZoom,
}: {
  readonly sessionInput: ReaderSessionInput | null;
  /** The surface the zoom layer fills; its rect is the layer's layout box. */
  readonly surface: HTMLDivElement | null;
  readonly updateZoom: (transform: (zoom: ZoomStateSummary) => ZoomStateSummary) => void;
}): { readonly zoomLayerRef: (node: HTMLDivElement | null) => void } {
  const [zoomLayer, setZoomLayer] = useState<HTMLDivElement | null>(null);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: a non-passive wheel listener on the zoom layer
  useEffect(() => {
    if (zoomLayer === null || surface === null || sessionInput === null) return;

    // Trackpads send many small deltas per frame; queue them and apply the whole
    // burst against one measured box in one state commit. Sequential
    // application keeps the result identical to applying each event alone.
    const initial = measureZoomBox(surface);
    if (initial === null) return;
    let box = initial;
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
            box.width,
            box.height,
            box.width,
            box.height,
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
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
      frame ??= window.requestAnimationFrame(flush);
    };

    const observer = new ResizeObserver(() => {
      box = measureZoomBox(surface) ?? box;
    });
    observer.observe(surface);
    zoomLayer.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      zoomLayer.removeEventListener('wheel', handleWheel);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- updateZoom is read by the deferred frame flush, not in the effect body
  }, [sessionInput, surface, updateZoom, zoomLayer]);

  return { zoomLayerRef: setZoomLayer };
}
