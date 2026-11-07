import * as React from 'react';
import { cn } from '../lib/cn.js';

/**
 * Padding is the state's own breathing room: `compact` for an empty block inside a page that
 * already has margins, `page` for a whole-region error, `none` for a placeholder whose
 * geometry must match the content it stands in for.
 */
const PADDING = {
  none: '',
  compact: 'p-8',
  page: 'px-6 py-12',
} as const;

const ALIGN = {
  center: 'items-center justify-center',
  stretch: '',
} as const;

export interface StateFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: keyof typeof PADDING;
  align?: keyof typeof ALIGN;
}

/**
 * The one frame the loading, empty and error states share (DESIGN.md §7.8): a vertical flex
 * column whose padding and alignment are the only things that differ between them. It draws no
 * border or fill; a state that needs a panel puts one inside.
 */
export const StateFrame = React.forwardRef<HTMLDivElement, StateFrameProps>(
  ({ padding = 'compact', align = 'center', className, ...props }, ref) => (
    <div
      ref={ref}
      data-state-frame=""
      className={cn('flex flex-col', ALIGN[align], PADDING[padding], className)}
      {...props}
    />
  ),
);
StateFrame.displayName = 'StateFrame';
