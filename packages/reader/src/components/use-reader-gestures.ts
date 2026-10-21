import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { isDoubleTap, PAN_THRESHOLD_PX, pinchScale, pointerDistance } from '../gestures.js';
import { calculateTapZones } from '../tap-zones.js';
import {
  applyDoubleTapZoom,
  applyPan,
  applyPinchZoom,
  clampZoomScale,
  clampZoomTransform,
} from '../zoom.js';
import type {
  ReaderNavigationAction,
  ReaderOverlayInsets,
  ReaderSessionInput,
  ReaderState,
  TapZoneRegion,
  ZoomStateSummary,
} from '../types.js';
import { measureZoomBox, type ZoomBox } from './zoom-box.js';

function findTapZone(
  zones: readonly TapZoneRegion[],
  x: number,
  y: number,
): TapZoneRegion | undefined {
  return zones.find(
    (zone) =>
      zone.width > 0 &&
      zone.height > 0 &&
      x >= zone.x &&
      x < zone.x + zone.width &&
      y >= zone.y &&
      y < zone.y + zone.height,
  );
}

interface ActivePointer {
  readonly x: number;
  readonly y: number;
}

interface PointerGesture {
  /** Pointers currently down, keyed by pointerId; two of them mean a pinch. */
  readonly pointers: Map<number, ActivePointer>;
  /** Pinch baseline: scale and separation when the second pointer landed. */
  pinch: { readonly scale: number; readonly distance: number } | null;
  lastTap: { readonly time: number; readonly x: number; readonly y: number } | null;
  /** Set once a drag passes the pan threshold, so its pointer-up is not a tap. */
  moved: boolean;
  /**
   * Surface layout box measured on the gesture's first pointer-down. The resize
   * observer below re-measures it, so a mid-gesture resize can never clamp
   * against the old box.
   */
  box: ZoomBox | null;
  /** Pan travel accumulated since the last frame. */
  pendingPan: { readonly x: number; readonly y: number } | null;
  /** A two-pointer move is waiting for the next frame. */
  pendingPinch: boolean;
}

function createPointerGesture(): PointerGesture {
  return {
    pointers: new Map(),
    pinch: null,
    lastTap: null,
    moved: false,
    box: null,
    pendingPan: null,
    pendingPinch: false,
  };
}

export interface ReaderGestures {
  readonly updateZoom: (transform: (zoom: ZoomStateSummary) => ZoomStateSummary) => void;
  readonly handleZoomPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly handleZoomPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly handleZoomPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

interface UseReaderGesturesInput {
  readonly sessionInput: ReaderSessionInput | null;
  readonly readerState: ReaderState | null;
  /** The surface the zoom layer fills; its rect is the layer's layout box. */
  readonly surface: HTMLDivElement | null;
  readonly overlayInsets: ReaderOverlayInsets;
  readonly navigate: (action: ReaderNavigationAction) => void;
  readonly onToggleChrome: () => void;
  readonly setReaderState: Dispatch<SetStateAction<ReaderState | null>>;
}

/**
 * The pointer half of the reader: pinch/double-tap/pan zoom on the page layer
 * and tap zones on the surface. The gesture record is a ref (it changes on
 * every pointer move and must never re-render the reader), created on the first
 * pointer event instead of on every render.
 */
export function useReaderGestures({
  sessionInput,
  readerState,
  surface,
  overlayInsets,
  navigate,
  onToggleChrome,
  setReaderState,
}: UseReaderGesturesInput): ReaderGestures {
  const pointerRef = useRef<PointerGesture | null>(null);
  const frameRef = useRef<number | null>(null);

  const updateZoom = useCallback(
    (transform: (zoom: ZoomStateSummary) => ZoomStateSummary) => {
      setReaderState((previous) =>
        previous === null ? previous : { ...previous, zoom: transform(previous.zoom) },
      );
    },
    [setReaderState],
  );

  // A reader resize (window, sidebar or shell collapse) changes the box the
  // gesture clamps against, so an active gesture re-measures it. The layer is
  // inset-0 in the surface, so observing the surface covers every layer resize.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: ResizeObserver on the reader surface re-measures the active gesture's box
  useEffect(() => {
    if (surface === null) return;
    const observer = new ResizeObserver(() => {
      const gesture = pointerRef.current;
      if (gesture !== null) gesture.box = measureZoomBox(surface);
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [surface]);

  // Pinch and pan publish one zoom state per frame instead of one per pointer
  // sample, and clamp against the cached surface box.
  const flushZoom = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const gesture = pointerRef.current;
    if (gesture === null) return;
    const box = gesture.box;
    if (box === null) return;

    const pan = gesture.pendingPan;
    const pinch = gesture.pendingPinch ? gesture.pinch : null;
    gesture.pendingPan = null;
    gesture.pendingPinch = false;

    if (pinch !== null) {
      const [first, second] = [...gesture.pointers.values()];
      if (first === undefined || second === undefined) return;
      updateZoom((zoom) =>
        clampZoomTransform(
          applyPinchZoom(zoom, zoom.scale, pinchScale(pinch, pointerDistance(first, second)), {
            centerX: (first.x + second.x) / 2 - box.left,
            centerY: (first.y + second.y) / 2 - box.top,
          }),
          box.width,
          box.height,
          box.width,
          box.height,
        ),
      );
      return;
    }

    if (pan !== null) {
      updateZoom((zoom) =>
        clampZoomTransform(
          applyPan(zoom, pan.x, pan.y),
          box.width,
          box.height,
          box.width,
          box.height,
        ),
      );
    }
  }, [updateZoom]);

  const scheduleZoomFlush = useCallback(() => {
    frameRef.current ??= requestAnimationFrame(flushZoom);
    // oxlint-disable-next-line react/memo-dependencies -- flushZoom runs from the deferred frame callback, not in this body; the rule cannot see that use
  }, [flushZoom]);

  const handleZoomPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = (pointerRef.current ??= createPointerGesture());
      const wasEmpty = gesture.pointers.size === 0;
      gesture.moved = false;
      gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (wasEmpty) {
        gesture.box = measureZoomBox(surface);
      }

      if (gesture.pointers.size === 2 && readerState !== null) {
        const [first, second] = [...gesture.pointers.values()];
        if (first !== undefined && second !== undefined) {
          // The second finger starts a pinch; travel queued by the first one
          // belongs to no gesture the user is still making.
          gesture.pendingPan = null;
          gesture.pinch = {
            scale: readerState.zoom.scale,
            distance: pointerDistance(first, second),
          };
        }
      }
    },
    [readerState, surface],
  );

  const handleZoomPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = (pointerRef.current ??= createPointerGesture());
      const pointer = gesture.pointers.get(event.pointerId);
      if (pointer === undefined || readerState === null) return;

      gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (gesture.pointers.size >= 2 && gesture.pinch !== null) {
        gesture.moved = true;
        gesture.pendingPinch = true;
        scheduleZoomFlush();
        return;
      }

      if (readerState.zoom.scale <= 1) return;

      const deltaX = event.clientX - pointer.x;
      const deltaY = event.clientY - pointer.y;
      if (!gesture.moved && Math.hypot(deltaX, deltaY) < PAN_THRESHOLD_PX) {
        return;
      }
      gesture.moved = true;
      const pan = gesture.pendingPan;
      gesture.pendingPan =
        pan === null ? { x: deltaX, y: deltaY } : { x: pan.x + deltaX, y: pan.y + deltaY };
      scheduleZoomFlush();
    },
    [readerState, scheduleZoomFlush],
  );

  const handleZoomPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = (pointerRef.current ??= createPointerGesture());
      // The last move always lands, even when its frame never ran.
      flushZoom();
      gesture.pointers.delete(event.pointerId);
      if (gesture.pointers.size < 2) {
        gesture.pinch = null;
        gesture.pendingPinch = false;
      }
    },
    [flushZoom],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!sessionInput || !readerState) return;

      const gesture = (pointerRef.current ??= createPointerGesture());
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // A double tap zooms instead of turning the page (pointer-based, so touch
      // devices get it too; `dblclick` never fires there).
      const tap = { time: Date.now(), x: event.clientX, y: event.clientY };
      const doubleTap = !gesture.moved && isDoubleTap(gesture.lastTap, tap);
      gesture.lastTap = gesture.moved ? null : tap;
      gesture.moved = false;
      if (doubleTap) {
        updateZoom((zoom) =>
          clampZoomTransform(
            applyDoubleTapZoom(
              zoom,
              { x, y },
              rect.width,
              rect.height,
              clampZoomScale(zoom, sessionInput.settings.doubleTapZoom),
            ),
            rect.width,
            rect.height,
            rect.width,
            rect.height,
          ),
        );
        return;
      }

      const zones = calculateTapZones(sessionInput, overlayInsets, readerState.zoom);
      const zone = findTapZone(zones, x, y);
      const action = zone?.action ?? { type: 'none' as const };

      if (action.type === 'toggleChrome') {
        onToggleChrome();
        return;
      }

      if (action.type === 'prevPage' || action.type === 'nextPage') {
        navigate({ type: action.type });
      }
    },
    [navigate, onToggleChrome, overlayInsets, readerState, sessionInput, updateZoom],
  );

  return {
    updateZoom,
    handleZoomPointerDown,
    handleZoomPointerMove,
    handleZoomPointerUp,
    handlePointerUp,
  };
}
