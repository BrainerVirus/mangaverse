import * as React from 'react';
import { Check, Clock, Download, RotateCw } from 'lucide-react';
import { cn } from '@design-system/lib/cn.js';
import {
  createUpdatePillMotion,
  useGsapContext,
  useReducedMotion,
  type UpdatePillIcon,
  type UpdatePillKind,
  type UpdatePillMotion,
} from '../motion/index.js';

// The ring is drawn in a 32-unit box shown at 16px: radius 14 plus a stroke of 3 (1.5px on screen)
// leaves the arc inside the box.
const RING_RADIUS = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const pillTones = {
  // A control surface that contrasts on `--sidebar`, the colour of the app frame.
  neutral: 'bg-sidebar-accent/30 text-sidebar-foreground hover:bg-sidebar-accent/50',
  // The one call to action in the frame: a restart is waiting on the reader.
  attention: 'bg-primary text-primary-foreground hover:bg-primary/90',
} as const;

/** The glyph of each phase; the check only shows for the moment a download completes. */
const iconFor: Record<UpdatePillKind, UpdatePillIcon> = {
  downloading: 'download',
  ready: 'rotate',
  queued: 'clock',
  restarting: 'rotate',
};

export interface UpdatePillProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** The phase: it picks the glyph, the tone and the motion between phases. */
  kind: UpdatePillKind;
  /** The visible text. A trailing `…` is drawn as three dots that fade in turn. */
  label: string;
  /** 0-100. When set, a progress ring is drawn around the icon. */
  progress?: number | undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function Layer({
  name,
  active,
  children,
}: {
  name: UpdatePillIcon;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      data-pill-icon={name}
      aria-hidden="true"
      className={cn(
        'absolute inset-0 grid place-items-center [&_svg]:size-3.5 [&_svg]:shrink-0',
        // The resting look before (or without) motion; GSAP owns the inline values afterwards.
        active ? (name === 'download' ? 'scale-70' : '') : 'scale-60 opacity-0',
      )}
    >
      {children}
    </span>
  );
}

/**
 * 22px tall for the native-thickness strip (28px on macOS, 32px on Windows and Linux). The focus
 * ring has no offset: 2px of ring fits in the 2.5px the 28px strip leaves above the pill, where an
 * offset ring would be clipped by the window's top edge.
 *
 * The title bar's update control: a compact pill on the app frame, icon first. `downloading`,
 * `queued` and `restarting` are a quiet control surface; `ready` is the filled call to action.
 * While downloading the icon sits inside a ring that fills as the download runs. Between phases
 * the label slides, the number counts, the width and colour glide and a finished download turns
 * into the restart glyph (`motion/shell/update-pill.ts`); reduced motion changes state at once.
 * The name and the click are never held back by it.
 */
const UpdatePill = React.forwardRef<HTMLButtonElement, UpdatePillProps>(
  (
    {
      className,
      kind,
      label,
      progress,
      type = 'button',
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onFocus,
      onBlur,
      onClick,
      ...props
    },
    ref,
  ) => {
    const tone = kind === 'ready' ? 'attention' : 'neutral';
    const pillRef = React.useRef<HTMLButtonElement | null>(null);
    const motionRef = React.useRef<UpdatePillMotion | null>(null);
    // The preference as of the last run: a cleanup from the first run must not close over a stale one.
    const reducedRef = React.useRef(false);
    const reducedMotion = useReducedMotion();
    React.useImperativeHandle(ref, () => pillRef.current as HTMLButtonElement, []);

    const percent = progress === undefined ? null : clampPercent(progress);
    const offset = RING_CIRCUMFERENCE * (1 - (percent ?? 0) / 100);
    const hasEllipsis = label.endsWith('…');
    const text = hasEllipsis ? label.slice(0, -1) : label;

    useGsapContext(
      pillRef,
      () => {
        const pill = pillRef.current;
        if (pill === null) return;
        reducedRef.current = reducedMotion;
        const created = motionRef.current === null;
        if (motionRef.current === null) {
          const find = <T extends Element>(selector: string): T => {
            const found = pill.querySelector<T>(selector);
            if (found === null) throw new Error(`UpdatePill: ${selector} is missing`);
            return found;
          };
          const icon = (name: UpdatePillIcon) => find<HTMLElement>(`[data-pill-icon="${name}"]`);
          motionRef.current = createUpdatePillMotion({
            pill,
            glow: find<HTMLElement>('[data-pill-glow]'),
            fill: find<HTMLElement>('[data-pill-fill]'),
            ring: find<Element>('[data-progress-ring-svg]'),
            arc: pill.querySelector<SVGElement>('[data-progress-arc]'),
            icons: {
              download: icon('download'),
              check: icon('check'),
              rotate: icon('rotate'),
              clock: icon('clock'),
            },
            labelSlot: find<HTMLElement>('[data-pill-label]'),
            text: find<HTMLElement>('[data-pill-text]'),
            dots: () => [...pill.querySelectorAll<HTMLElement>('[data-pill-dot]')],
          });
        }
        motionRef.current.to({ kind, label, percent }, { reducedMotion });
        // Every run adds its cleanup to the context, so only the run that made the controller does.
        if (!created) return;
        return () => {
          motionRef.current?.exit({ reducedMotion: reducedRef.current });
          motionRef.current?.dispose();
          motionRef.current = null;
        };
      },
      [kind, label, percent, reducedMotion],
      { revertOnUpdate: false },
    );

    const options = { reducedMotion };
    return (
      <button
        ref={pillRef}
        type={type}
        data-tone={tone}
        data-kind={kind}
        className={cn(
          'relative isolate inline-flex h-5.5 items-center gap-1.5 whitespace-nowrap rounded-badge px-2.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
          pillTones[tone],
          className,
        )}
        onClick={(event) => {
          // While the old label is still on show, a click must not do what the new one says.
          if (motionRef.current?.pending() === true) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          motionRef.current?.hover(true, options);
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          motionRef.current?.hover(false, options);
          motionRef.current?.press(false, options);
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          motionRef.current?.press(true, options);
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          motionRef.current?.press(false, options);
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          motionRef.current?.press(false, options);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          if (event.currentTarget.matches(':focus-visible'))
            motionRef.current?.hover(true, options);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          motionRef.current?.hover(false, options);
        }}
        {...props}
      >
        <span
          data-pill-fill
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-badge bg-primary opacity-0"
        />
        <span
          data-pill-glow
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-badge bg-primary opacity-0"
        />
        <span
          data-pill-icons
          className="relative grid size-4 place-items-center"
          aria-hidden="true"
        >
          <svg
            data-progress-ring-svg
            {...(kind === 'downloading' ? { 'data-progress-ring': '' } : {})}
            viewBox="0 0 32 32"
            fill="none"
            focusable="false"
            className={cn(
              'absolute inset-0 size-4 -rotate-90',
              kind === 'downloading' ? '' : 'opacity-0',
            )}
          >
            <circle
              cx="16"
              cy="16"
              r={RING_RADIUS}
              stroke="currentColor"
              strokeWidth={3}
              opacity={0.25}
            />
            <circle
              data-progress-arc
              cx="16"
              cy="16"
              r={RING_RADIUS}
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          </svg>
          <Layer name="download" active={iconFor[kind] === 'download'}>
            <Download />
          </Layer>
          <Layer name="check" active={false}>
            <Check />
          </Layer>
          <Layer name="rotate" active={iconFor[kind] === 'rotate'}>
            <RotateCw />
          </Layer>
          <Layer name="clock" active={iconFor[kind] === 'clock'}>
            <Clock />
          </Layer>
        </span>
        <span data-pill-label className="relative grid overflow-hidden">
          <span data-pill-text>
            {text}
            {hasEllipsis
              ? [0, 1, 2].map((dot) => (
                  <span key={dot} data-pill-dot aria-hidden="true">
                    .
                  </span>
                ))
              : null}
          </span>
        </span>
      </button>
    );
  },
);
UpdatePill.displayName = 'UpdatePill';

export { UpdatePill };
