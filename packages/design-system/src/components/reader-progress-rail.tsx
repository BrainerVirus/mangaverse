import * as React from 'react';
import { DURATION, CSS_EASING } from '../motion/index.js';
import { cn } from '../lib/cn.js';
import { GlassSurface } from './glass-surface.js';

type ReaderProgressStyle = React.CSSProperties & {
  [variable: `--${string}`]: string | number | undefined;
};

export interface ReaderProgressRailProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  /** Called when a drag starts/ends so callers can pause auto-follow. */
  readonly onScrubStart?: () => void;
  readonly onScrubEnd?: () => void;
  /** Small preview (page thumbnail) rendered above the rail while hovering/dragging. */
  readonly renderPreview?: (value: number) => React.ReactNode;
  readonly reducedMotion?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Reader progress rail: a filled, rounded track with a draggable thumb and an
 * optional hover/drag preview (YouTube-style scrubber). The fill and thumb move
 * with transforms only, so scrubbing stays on the compositor.
 */
export function ReaderProgressRail({
  value,
  min,
  max,
  onChange,
  onScrubStart,
  onScrubEnd,
  renderPreview,
  reducedMotion = false,
  className,
  ariaLabel = 'Page slider',
}: ReaderProgressRailProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const [hoverValue, setHoverValue] = React.useState(value);
  const [hoverX, setHoverX] = React.useState(0);
  // Pointer moves fire faster than frames; one preview/commit per frame is
  // everything the reader can show, so moves queue and the frame loops over
  // the latest position only.
  const pendingRef = React.useRef<{ clientX: number; commit: boolean } | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const committedRef = React.useRef<number | null>(null);
  // Track box measured once per hover/drag: the rail does not move beneath the
  // pointer, and re-measuring per move is a layout read per pointer sample.
  // shortcut: a resize mid-drag keeps the start width until release; upgrade only if the rail can resize while captured.
  const rectRef = React.useRef<DOMRect | null>(null);

  const span = Math.max(1, max - min);
  const percent = clamp(((value - min) / span) * 100, 0, 100);

  const commit = React.useCallback(
    (next: number) => {
      if (next === committedRef.current || next === value) return;
      committedRef.current = next;
      onChange(next);
    },
    [onChange, value],
  );

  const valueFromClientX = React.useCallback(
    (clientX: number): { next: number; x: number } => {
      const track = trackRef.current;
      if (track === null) return { next: value, x: 0 };
      const rect = rectRef.current ?? track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      return { next: Math.round(min + ratio * span), x: ratio * rect.width };
    },
    [min, span, value],
  );

  const flushPending = React.useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;
    const { next, x } = valueFromClientX(pending.clientX);
    setHoverValue(next);
    setHoverX(x);
    if (pending.commit) commit(next);
  }, [commit, valueFromClientX]);

  const queuePointer = React.useCallback(
    (clientX: number, commitValue: boolean) => {
      const previous = pendingRef.current;
      pendingRef.current = { clientX, commit: commitValue || previous?.commit === true };
      frameRef.current ??= requestAnimationFrame(flushPending);
    },
    // oxlint-disable-next-line react/memo-dependencies -- flushPending runs from the deferred frame callback, not in this body; the rule cannot see that use
    [flushPending],
  );

  // react-doctor-disable-next-line team-conventions/no-use-effect -- external boundary: a pending frame belongs to the browser frame loop and must not commit after the rail unmounts
  React.useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      rectRef.current = event.currentTarget.getBoundingClientRect();
      // Each drag dedupes from the page the reader actually shows, so a page
      // turned elsewhere (keyboard, tap, scroll) can be scrubbed back to.
      committedRef.current = value;
      const { next, x } = valueFromClientX(event.clientX);
      setScrubbing(true);
      setHoverValue(next);
      setHoverX(x);
      onScrubStart?.();
      commit(next);
    },
    [commit, onScrubStart, value, valueFromClientX],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      queuePointer(event.clientX, scrubbing);
    },
    [queuePointer, scrubbing],
  );

  const endScrub = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      // The release position always wins, even if its frame never ran.
      flushPending();
      rectRef.current = null;
      setScrubbing(false);
      onScrubEnd?.();
    },
    [flushPending, onScrubEnd, scrubbing],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = value + 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = value - 1;
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(clamp(next, min, max));
    },
    [max, min, onChange, value],
  );

  const showPreview = renderPreview !== undefined && (hovering || scrubbing);
  const transition = reducedMotion
    ? 'none'
    : `transform ${DURATION.readerRail}ms ${CSS_EASING.readerRail}`;

  return (
    <div className={cn('relative flex-1 py-3', className)}>
      {showPreview ? (
        <div
          className="reader-progress-preview pointer-events-none absolute bottom-full z-10 -translate-x-1/2"
          // The preview follows the measured pointer position, which no static class can carry.
          style={{ '--reader-progress-x': `${hoverX}px` } as ReaderProgressStyle}
          data-testid="reader-rail-preview"
        >
          <GlassSurface
            level="stage"
            tone="reader"
            elevation={3}
            className="overflow-hidden rounded-lg"
            data-testid="reader-rail-preview-surface"
          >
            {renderPreview(hoverValue)}
            <div className="type-meta px-2 py-1 text-center tabular-nums text-white">
              {hoverValue}
            </div>
          </GlassSurface>
        </div>
      ) : null}

      <div
        ref={trackRef}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the scrubber is a custom widget (pointer capture, transform fill, hover preview); <input type="range"> would replace the whole track/thumb markup, its CSS and the E2E handles for no a11y gain (the ARIA slider contract below is already complete)
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative h-2 w-full cursor-pointer touch-none rounded-full bg-white/25 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerEnter={(event) => {
          rectRef.current = event.currentTarget.getBoundingClientRect();
          setHovering(true);
        }}
        onPointerLeave={() => {
          rectRef.current = null;
          setHovering(false);
        }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="reader-progress-fill absolute inset-y-0 left-0 w-full rounded-full bg-white"
          // Progress and reduced-motion transition are computed from reader state.
          style={
            {
              '--reader-progress-scale': percent / 100,
              '--reader-progress-transition': transition,
            } as ReaderProgressStyle
          }
          data-testid="reader-rail-fill"
        />
        <div
          className="reader-progress-thumb absolute top-1/2 h-4 w-4 rounded-full bg-white shadow"
          // The thumb position and reduced-motion transition are computed from reader state.
          style={
            {
              '--reader-progress-position': `${percent}%`,
              '--reader-progress-transition': transition,
            } as ReaderProgressStyle
          }
          data-testid="reader-rail-thumb"
        />
      </div>
    </div>
  );
}
