import { createRouter } from '@tanstack/react-router';
import type { PlatformCapabilities } from '@app/platform';
import { routeTree } from './routeTree.gen';
import { LoadingState } from '@app/design-system';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { routeEnter, useReducedMotion } from '@app/design-system/motion';
import { NotFoundPage, RouteErrorPage } from './components/StatusPages.js';
import { feedback } from './lib/app-feedback.js';

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
    defaultErrorComponent: RouteErrorPage,
    defaultOnCatch: (error) => feedback.log(error, 'route'),
    defaultNotFoundComponent: NotFoundPage,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
    context: RouterContext;
  }
}
