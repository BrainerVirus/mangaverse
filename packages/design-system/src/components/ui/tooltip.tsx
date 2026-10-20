import * as React from 'react';
import { cn } from '@design-system/lib/cn.js';

interface TooltipProps {
  /** Label revealed on hover and on keyboard focus. */
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

// CSS-only tooltip. It must stay hidden until the trigger is hovered or focused:
// rendering the bubble inline puts a popover-looking box around every trigger.
// shortcut: right-edge placement only (the collapsed sidebar rail); add side variants
// when a consumer needs another edge.
const Tooltip = React.forwardRef<HTMLSpanElement, TooltipProps>(
  ({ className, content, children }, ref) => (
    <span ref={ref} className={cn('group/tooltip relative flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-control bg-popover px-3 py-1.5 text-sm text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
      >
        {content}
      </span>
    </span>
  ),
);
Tooltip.displayName = 'Tooltip';

export { Tooltip };
