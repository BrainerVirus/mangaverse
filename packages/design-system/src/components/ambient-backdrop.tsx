import * as React from 'react';
import { useGSAP } from '@gsap/react';
import { routeEnter, useReducedMotion } from '@app/motion';
import { cn } from '../lib/cn.js';
import { useGlassProfileFallback } from '../hooks/use-glass-profile-fallback.js';

/**
 * DESIGN.md §2.3 — the ambient band behind the shell's content: fixed, decorative, never
 * scrolling, and off under reduced motion, reduced transparency or the low-end profile.
 * Rendered once by the app shell, never inside the reader.
 */
export const AmbientBackdrop = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, forwardedRef) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const profileFallback = useGlassProfileFallback();
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useGSAP(
    () => {
      if (!reducedMotion && !profileFallback && ref.current) routeEnter(ref.current);
    },
    { scope: ref, dependencies: [reducedMotion, profileFallback], revertOnUpdate: true },
  );

  return (
    <div
      ref={setRef}
      {...props}
      aria-hidden="true"
      data-ambient-backdrop=""
      className={cn('ambient-backdrop', className)}
    />
  );
});
AmbientBackdrop.displayName = 'AmbientBackdrop';
