/// <reference types="vite/client" />

import { createRootRoute, HeadContent, Scripts, Outlet, useRouter } from '@tanstack/react-router';
import type { PlatformCapabilities } from '@app/platform';
import { ShellProviders } from '../components/ShellProviders.js';
import '@app/design-system/styles/globals.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'MangaVerse' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const router = useRouter();
  const detectFn = (router.options.context as { platformDetectFn?: () => PlatformCapabilities })?.platformDetectFn;

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
