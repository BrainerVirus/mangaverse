import * as React from 'react';
import { cn } from '../lib/cn.js';

/**
 * DESIGN.md §2.3 — the ambient band behind the shell's content: fixed, decorative, never
 * scrolling, and off under reduced motion, reduced transparency or the low-end profile.
 * Rendered once by the app shell, never inside the reader.
 */
export const AmbientBackdrop = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden="true"
    data-ambient-backdrop=""
    className={cn('ambient-backdrop', className)}
    {...props}
  />
));
AmbientBackdrop.displayName = 'AmbientBackdrop';
