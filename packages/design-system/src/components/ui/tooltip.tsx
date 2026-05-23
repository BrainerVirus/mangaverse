import * as React from 'react';
import { cn } from '../../lib/cn.js';

const Tooltip = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'z-50 overflow-hidden rounded-[var(--radius-control)] bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md',
        className
      )}
      {...props}
    />
  )
);
Tooltip.displayName = 'Tooltip';

export { Tooltip };