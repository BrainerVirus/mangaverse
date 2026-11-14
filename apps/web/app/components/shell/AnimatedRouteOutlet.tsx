import { useRef } from 'react';
import { useMatches } from '@tanstack/react-router';
import { useGSAP } from '@gsap/react';
import type { ReactNode } from 'react';
import {
  routeEnter,
  useReducedMotion,
  type RouteTransitionVariant,
} from '@app/design-system/motion';

interface AnimatedRouteOutletProps {
  children: ReactNode;
  variant?: RouteTransitionVariant;
  className?: string;
}

export function AnimatedRouteOutlet({
  children,
  variant = 'default',
  className = 'min-h-full',
}: AnimatedRouteOutletProps) {
  // The page on screen, not the URL: the URL changes when a navigation starts, and replaying the
  // enter then would run it on the page being left while the next one loads.
  const pathname = useMatches({ select: (matches) => matches.at(-1)?.pathname });
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useGSAP(
    () => {
      if (!ref.current) return;
      routeEnter(ref.current, { reducedMotion, variant });
    },
    // A new page reverts the previous enter first, so two tweens never fight over the outlet.
    { scope: ref, dependencies: [pathname, reducedMotion, variant], revertOnUpdate: true },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
