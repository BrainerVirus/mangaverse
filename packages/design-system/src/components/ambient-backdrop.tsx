import * as React from 'react';
import { useGSAP } from '@gsap/react';
import { fadeIn, useReducedMotion } from '../motion/index.js';
import { cn } from '../lib/cn.js';
import { useGlassProfileFallback } from '../hooks/use-glass-profile-fallback.js';

/**
 * The band fades in once per app session. The shell remounts it after the reader, and a second
 * fade there would read as the whole window blinking.
 */
let entrancePlayed = false;

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
      if (typeof forwardedRef === 'function') {
        const callbackRef: React.RefCallback<HTMLDivElement> = forwardedRef;
        const cleanup = callbackRef(node);
        if (typeof cleanup === 'function') {
          return () => {
            try {
              cleanup();
            } finally {
              ref.current = null;
            }
          };
        }
      } else if (forwardedRef) {
        forwardedRef.current = node;
        if (node !== null) {
          return () => {
            ref.current = null;
            forwardedRef.current = null;
          };
        }
      }
      return undefined;
    },
    [forwardedRef],
  );

  useGSAP(
    () => {
      if (entrancePlayed || reducedMotion || profileFallback || ref.current === null) return;
      // Marked once it has played: the profile is only known after hydration, and a fade reverted
      // before it ends (a strict-mode remount) plays again.
      fadeIn(ref.current, {
        onComplete: () => {
          entrancePlayed = true;
        },
      });
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
