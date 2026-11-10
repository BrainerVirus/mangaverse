import * as React from 'react';
import { cn } from '@design-system/lib/cn.js';

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

export interface UpdatePillProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  tone?: keyof typeof pillTones;
  /** The glyph before the label; it is decorative, the button's name comes from `aria-label`. */
  icon: React.ReactNode;
  label: string;
  /** 0-100. When set, a progress ring is drawn around the icon. */
  progress?: number | undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function ProgressRing({ progress, icon }: { progress: number; icon: React.ReactNode }) {
  const offset = RING_CIRCUMFERENCE * (1 - clampPercent(progress) / 100);
  return (
    <span data-progress-ring className="relative grid size-4 place-items-center">
      <svg
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="absolute inset-0 size-4 -rotate-90"
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
          className="progress-ring-arc motion-reduce:transition-none"
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
      <span
        className="grid place-items-center [&_svg]:size-2.5 [&_svg]:shrink-0"
        aria-hidden="true"
      >
        {icon}
      </span>
    </span>
  );
}

/**
 * 22px tall for the native-thickness strip (28px on macOS, 32px on Windows and Linux). The focus
 * ring has no offset: 2px of ring fits in the 2.5px the 28px strip leaves above the pill, where an
 * offset ring would be clipped by the window's top edge.
 *
 * The title bar's update control: a compact pill on the app frame, icon first. `neutral` is a
 * quiet control surface (downloading, restart queued, restarting); `attention` is the filled
 * call to action. With `progress` the icon sits inside a ring that fills as the download runs.
 */
const UpdatePill = React.forwardRef<HTMLButtonElement, UpdatePillProps>(
  ({ className, tone = 'neutral', icon, label, progress, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-tone={tone}
      className={cn(
        'inline-flex h-5.5 items-center gap-1.5 whitespace-nowrap rounded-badge px-2.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
        pillTones[tone],
        className,
      )}
      {...props}
    >
      {progress === undefined ? (
        <span
          className="grid place-items-center [&_svg]:size-3.5 [&_svg]:shrink-0"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : (
        <ProgressRing progress={progress} icon={icon} />
      )}
      <span>{label}</span>
    </button>
  ),
);
UpdatePill.displayName = 'UpdatePill';

export { UpdatePill };
