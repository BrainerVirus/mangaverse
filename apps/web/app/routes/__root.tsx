/// <reference types="vite/client" />

import { createRootRoute, HeadContent, Scripts, Outlet, useRouter } from '@tanstack/react-router';
import type { PlatformCapabilities } from '@app/platform';
// Same file globals.css aliases to the "Inter" stack. Preloading it starts the
// face fetch beside the stylesheet instead of after the CSS parses; font-src
// 'self' covers it under the desktop CSP.
import interFontUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import { ShellProviders } from '../components/ShellProviders.js';
import '@app/design-system/styles/globals.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'MangaVerse' },
    ],
    links: [
      {
        rel: 'preload',
        href: interFontUrl,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const router = useRouter();
  const detectFn = (router.options.context as { platformDetectFn?: () => PlatformCapabilities })
    ?.platformDetectFn;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ShellProviders detectFn={detectFn}>
          <Outlet />
        </ShellProviders>
        <Scripts />
      </body>
    </html>
  );
}
