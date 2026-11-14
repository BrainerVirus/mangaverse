import { useMatches } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { TitleBar } from '../components/shell/TitleBar.js';
import { AppShellLayout } from './AppShellLayout.js';
import { ReaderLayout } from './ReaderLayout.js';

const READER_ROUTE_ID = '/reader/$chapterId';

/**
 * The reader or the app shell, picked from the matches on screen rather than the URL: the URL
 * changes as soon as a navigation starts, while the page it leads to may still be loading, and
 * the page on screen must never be drawn inside the other layout meanwhile.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const isReader = useMatches({
    select: (matches) => matches.some((match) => match.routeId === READER_ROUTE_ID),
  });

  return (
    <>
      {/* Keyboard users land on the shell first; the skip link is the only focusable element
          before the title bar and the sidebar, so one Tab + Enter reaches the page content
          without walking the whole navigation. It shows below the title bar. The reader has no
          skip link: its title bar Update pill is the first stop. */}
      {isReader ? null : (
        <a
          href="#main-content"
          className="skip-link rounded-control bg-primary type-label text-primary-foreground shadow-lg outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background pointer-coarse:focus:min-h-11"
        >
          Skip to content
        </a>
      )}
      {/* One title bar for both layouts, so moving between the reader and the shell never
          remounts it (no frame without the strip, no jump of the page below it). It is fixed at
          the top, so it can sit here in the DOM: its Update pill comes right after the skip link
          and before the page. */}
      <TitleBar />
      {isReader ? (
        <ReaderLayout>{children}</ReaderLayout>
      ) : (
        <AppShellLayout>{children}</AppShellLayout>
      )}
    </>
  );
}
