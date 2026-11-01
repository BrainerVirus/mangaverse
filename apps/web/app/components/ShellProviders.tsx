import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Toaster } from '@app/design-system';
import type { PlatformCapabilities } from '@app/platform';
import { QueryProvider } from '../providers/query-provider.js';
import { LocalDbProvider } from '../providers/local-db-provider.js';
import { CoverCacheBridge } from '../providers/cover-cache-bridge.js';
import { PlatformProvider } from '../providers/platform-provider.js';
import { ThemeProvider } from '../providers/theme-provider.js';
import { ThemeSettingsBridge } from '../providers/theme-settings-bridge.js';
import { ShellAppearanceBridge } from '../providers/shell-appearance-bridge.js';
import { LocalDataPrefetch } from './LocalDataPrefetch.js';
import { OnboardingGate } from './OnboardingGate.js';
import { LocalDbErrorBanner } from './PersistenceErrorBanner.js';
import { AppShellLayout } from '../layouts/AppShellLayout.js';
import { ReaderLayout } from '../layouts/ReaderLayout.js';
import { useCommandPaletteStore } from '../stores/useCommandPaletteStore';
import { CommandPalette } from './shell/CommandPalette.js';

interface ShellProvidersProps {
  children: ReactNode;
  detectFn?: (() => PlatformCapabilities) | undefined;
}

function AppShellOrReaderLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isReaderMatch = location.pathname.startsWith('/reader/');
  return isReaderMatch ? (
    <ReaderLayout>{children}</ReaderLayout>
  ) : (
    <AppShellLayout>{children}</AppShellLayout>
  );
}

function KeyboardShortcuts() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const open = useCommandPaletteStore((s) => s.open);
  const close = useCommandPaletteStore((s) => s.close);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-window-keydown: a global Cmd/Ctrl+K shortcut is a window-level external-system subscription that must outlive any single input.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') {
        return;
      }

      e.preventDefault();
      if (isOpen) {
        close();
      } else {
        open();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, open, close]);

  return null;
}

export function ShellProviders({ children, detectFn }: ShellProvidersProps) {
  return (
    <QueryProvider>
      <LocalDbProvider>
        <CoverCacheBridge>
          <PlatformProvider detectFn={detectFn}>
            <ThemeProvider>
              <ShellAppearanceBridge />
              <ThemeSettingsBridge />
              <LocalDataPrefetch />
              <KeyboardShortcuts />
              <CommandPalette />
              <LocalDbErrorBanner />
              <Toaster />
              <OnboardingGate>
                <AppShellOrReaderLayout>{children}</AppShellOrReaderLayout>
              </OnboardingGate>
            </ThemeProvider>
          </PlatformProvider>
        </CoverCacheBridge>
      </LocalDbProvider>
    </QueryProvider>
  );
}
