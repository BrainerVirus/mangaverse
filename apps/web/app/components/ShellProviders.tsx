import { useEffect } from 'react';
import { useLocation, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { PlatformCapabilities } from '@app/platform';
import { QueryProvider } from '../providers/query-provider.js';
import { LocalDbProvider } from '../providers/local-db-provider.js';
import { PlatformProvider } from '../providers/platform-provider.js';
import { ThemeProvider } from '../providers/theme-provider.js';
import { AppShellLayout } from '../layouts/AppShellLayout.js';
import { ReaderLayout } from '../layouts/ReaderLayout.js';
import { useCommandPaletteStore } from '../stores/useCommandPaletteStore';
import { useNavigationStore } from '../stores/useNavigationStore';
import { CommandPalette } from './shell/CommandPalette.js';

interface ShellProvidersProps {
  children: ReactNode;
  detectFn?: (() => PlatformCapabilities) | undefined;
}

function AppShellOrReaderLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isReaderMatch = location.pathname.startsWith('/reader/');
  return isReaderMatch ? <ReaderLayout>{children}</ReaderLayout> : <AppShellLayout>{children}</AppShellLayout>;
}

function KeyboardShortcuts() {
  const openPalette = useCommandPaletteStore((s) => s.open);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openPalette]);

  return null;
}

function NavigationTracker() {
  const router = useRouter();
  const pushRecentRoute = useNavigationStore((s) => s.pushRecentRoute);

  useEffect(() => {
    const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => {
      const segments = toLocation.pathname.split('/').filter(Boolean);
      const label = toLocation.pathname === '/' ? 'Home' : (segments[segments.length - 1] || 'Home');
      const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
      pushRecentRoute({
        path: toLocation.pathname,
        label: displayLabel,
        timestamp: Date.now(),
      });
    });
    return unsubscribe;
  }, [router, pushRecentRoute]);

  return null;
}

export function ShellProviders({ children, detectFn }: ShellProvidersProps) {
  return (
    <QueryProvider>
      <LocalDbProvider>
        <PlatformProvider detectFn={detectFn}>
          <ThemeProvider>
          <KeyboardShortcuts />
          <NavigationTracker />
          <CommandPalette />
          <AppShellOrReaderLayout>{children}</AppShellOrReaderLayout>
          </ThemeProvider>
        </PlatformProvider>
      </LocalDbProvider>
    </QueryProvider>
  );
}