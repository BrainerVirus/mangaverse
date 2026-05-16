/// <reference types="vite/client" />

import * as React from 'react';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import { ThemeProvider } from '../providers/theme-provider.js';
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
  errorComponent: () => (
    <main className="app-shell">
      Internal Server Error
    </main>
  ),
  notFoundComponent: () => (
    <main className="app-shell">
      Page Not Found
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <ThemeProvider>
        <body>
          {children}
          <Scripts />
        </body>
      </ThemeProvider>
    </html>
  );
}
