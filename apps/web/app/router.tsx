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

  useGSAP(
    () => {
      if (ref.current) routeEnter(ref.current, { reducedMotion });
    },
    { scope: ref, dependencies: [reducedMotion] },
  );

  return <div ref={ref}>{children}</div>;
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
      <section aria-label="Something went wrong">
        <ErrorState
          title="Something went wrong"
          message={error instanceof Error ? error.message : 'An unexpected error occurred'}
        />
      </section>
    ),
    defaultNotFoundComponent: () => (
      <section aria-label="Page not found">
        <EmptyState type="no-results" />
      </section>
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
