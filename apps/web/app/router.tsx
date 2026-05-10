import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: () => (
      <main className="app-shell">
        Internal Server Error
      </main>
    ),
    defaultNotFoundComponent: () => (
      <main className="app-shell">
        Page Not Found
      </main>
    ),
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
