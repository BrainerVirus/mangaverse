import { useRef } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useGSAP } from '@gsap/react';
import type { ReactNode } from 'react';
import { routeEnter, useReducedMotion, type RouteTransitionVariant } from '@app/motion';

interface AnimatedRouteOutletProps {
  children: ReactNode;
  variant?: RouteTransitionVariant;
}

export function AnimatedRouteOutlet({ children, variant = 'default' }: AnimatedRouteOutletProps) {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useGSAP(
    () => {
      if (!ref.current) return;
      routeEnter(ref.current, { reducedMotion, variant });
    },
    { scope: ref, dependencies: [location.pathname, reducedMotion, variant] },
  );

  return (
    <div ref={ref} className="min-h-full">
      {children}
    </div>
  );
}
