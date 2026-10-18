import * as React from 'react';
import { cn } from '@design-system/lib/cn.js';

export interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: 'horizontal' | 'vertical';
}

const Separator = React.forwardRef<HTMLHRElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => (
    <hr
      ref={ref}
      aria-orientation={orientation}
      className={cn(
        // preflight gives every hr a 1px border-top; zero it so the box stays exactly
        // the 1px line it renders (and the vertical variant gets no stray border).
        'shrink-0 border-0 bg-[var(--border)]',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = 'Separator';

export { Separator };
