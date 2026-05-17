import { createRouter } from '@tanstack/react-router';
import type { PlatformCapabilities } from '@app/platform';
import { routeTree } from './routeTree.gen';
import { LoadingState, ErrorState, EmptyState } from '@app/design-system';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { routeEnter, useReducedMotion } from '@app/motion';

interface RouterContext {
  platformDetectFn?: () => PlatformCapabilities;
}

function RouteTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useGSAP(() => {
    if (ref.current) routeEnter(ref.current, { reducedMotion });
  }, { scope: ref, dependencies: [reducedMotion] });

  return <div ref={ref} className="route-transition">{children}</div>;
}

export function getRouter(options: { platformDetectFn?: () => PlatformCapabilities } = {}) {
  return createRouter({
    routeTree,
    context: {
      platformDetectFn: options.platformDetectFn,
    } as RouterContext,
    defaultPreload: 'intent',
    defaultPendingComponent: () => (
      <RouteTransition>
        <LoadingState type="grid" />
      </RouteTransition>
    ),
    defaultErrorComponent: ({ error }) => (
      <main className="app-shell">
        <ErrorState
          title="Something went wrong"
          message={error?.message || 'An unexpected error occurred'}
        />
      </main>
    ),
    defaultNotFoundComponent: () => (
      <main className="app-shell">
        <EmptyState type="no-results" />
      </main>
    ),
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
    context: RouterContext;
  }
}