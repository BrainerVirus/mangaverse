import * as React from 'react';
import { cn } from '../lib/cn.js';

/**
 * The inline empty note: one line of muted text in the shared row frame. `EmptyState` is the
 * page-scale block with an icon and an action; this is its inline sibling for an empty list,
 * a provider with no sources, or no search matches.
 */
export type EmptyNoteProps = React.HTMLAttributes<HTMLParagraphElement>;

export function EmptyNote({ className, children, ...props }: EmptyNoteProps) {
  return (
    <p
      className={cn(
        'rounded-box border border-border px-4 py-6 text-sm text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
