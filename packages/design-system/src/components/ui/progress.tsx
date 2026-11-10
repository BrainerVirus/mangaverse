import * as React from 'react';
import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { cn } from '@design-system/lib/cn.js';

/**
 * A determinate (or, with `value={null}`, indeterminate) bar. The root is the `progressbar`: give it
 * a name with `aria-label` or `aria-labelledby`. Base UI exposes the value as `aria-valuenow` and
 * `aria-valuetext` and never announces it, so a percent that changes every tick stays silent; say
 * the milestone once in text instead.
 *
 * The fill eases between values (`progress-fill`, width only) and snaps for reduced motion.
 */
const Progress = React.forwardRef<HTMLDivElement, Omit<ProgressPrimitive.Root.Props, 'children'>>(
  ({ className, ...props }, ref) => (
    <ProgressPrimitive.Root ref={ref} className={cn('flex w-full', className)} {...props}>
      <ProgressPrimitive.Track className="relative h-1.5 w-full overflow-hidden rounded-badge bg-muted">
        <ProgressPrimitive.Indicator className="h-full rounded-badge bg-primary progress-fill motion-reduce:transition-none" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  ),
);
Progress.displayName = 'Progress';

export { Progress };
