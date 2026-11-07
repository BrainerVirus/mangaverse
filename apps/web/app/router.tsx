import { createRouter } from '@tanstack/react-router';
import type { PlatformCapabilities } from '@app/platform';
import { routeTree } from './routeTree.gen';
import { NotFoundPage, RouteErrorPage } from './components/StatusPages.js';
import { feedback } from './lib/app-feedback.js';

interface RouterContext {
  platformDetectFn?: () => PlatformCapabilities;
}

/**
 * What stands in for a route whose chunk is still loading. Which page is coming is not known
 * here (the Electron shell prerenders this one markup for every URL), so it paints no content
 * placeholder: a card grid would claim a library for every route and be replaced wholesale.
 * The shell around it stays, and the page renders its own header and placeholders once loaded.
 */
function RoutePending() {
  return (
    <output aria-label="Loading page" className="block min-h-full">
      <span className="sr-only">Loading…</span>
    </output>
  );
}

export function getRouter(options: { platformDetectFn?: () => PlatformCapabilities } = {}) {
  return createRouter({
    routeTree,
    context: {
      platformDetectFn: options.platformDetectFn,
    } as RouterContext,
    defaultPreload: 'intent',
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteErrorPage,
    defaultOnCatch: (error) => feedback.log(error, 'route'),
    defaultNotFoundComponent: NotFoundPage,
    scrollRestoration: true,
    // The window never scrolls: `<main>` in the shell does. Tagging it restores
    // the list position on Back, and this selector resets it on a fresh route.
    scrollToTopSelectors: ['[data-scroll-restoration-id="app-main"]'],
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
    context: RouterContext;
  }
}
