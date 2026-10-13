import * as React from 'react';
import { cn } from '../lib/cn.js';

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

  const span = Math.max(1, max - min);
  const percent = clamp(((value - min) / span) * 100, 0, 100);

  const valueFromClientX = React.useCallback(
    (clientX: number): { next: number; x: number } => {
      const track = trackRef.current;
      if (track === null) return { next: value, x: 0 };
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      return { next: Math.round(min + ratio * span), x: ratio * rect.width };
    },
    [min, span, value],
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const { next, x } = valueFromClientX(event.clientX);
      setScrubbing(true);
      setHoverValue(next);
      setHoverX(x);
      onScrubStart?.();
      onChange(next);
    },
    [onChange, onScrubStart, valueFromClientX],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const { next, x } = valueFromClientX(event.clientX);
      setHoverValue(next);
      setHoverX(x);
      if (scrubbing) {
        onChange(next);
      }
    },
    [onChange, scrubbing, valueFromClientX],
  );

  const endScrub = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      setScrubbing(false);
      onScrubEnd?.();
    },
    [onScrubEnd, scrubbing],
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
  const transition = reducedMotion ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div className={cn('relative flex-1 py-3', className)}>
      {showPreview ? (
        <div
          className="pointer-events-none absolute bottom-full z-10 -translate-x-1/2"
          style={{
            left: `${hoverX}px`,
            transform: `translateX(-50%) scale(${hovering || scrubbing ? 1 : 0.9})`,
            transition: reducedMotion ? 'none' : 'transform 120ms ease-out',
          }}
          data-testid="reader-rail-preview"
        >
          <div className="overflow-hidden rounded-lg border border-white/20 bg-black/80 shadow-lg">
            {renderPreview(hoverValue)}
          </div>
          <div className="mt-1 text-center text-[10px] text-white/80">{hoverValue}</div>
        </div>
      ) : null}

      <div
        ref={trackRef}
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
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white"
          style={{ width: '100%', transform: `scaleX(${percent / 100})`, transformOrigin: 'left center', transition }}
          data-testid="reader-rail-fill"
        />
        <div
          className="absolute top-1/2 h-4 w-4 rounded-full bg-white shadow"
          // A percentage translate resolves against the thumb's own 16px box, so
          // the position must come from `left`; translate only centers it.
          style={{ left: `${percent}%`, transform: 'translate(-50%, -50%)', transition }}
          data-testid="reader-rail-thumb"
        />
      </div>
    </div>
  );
}
