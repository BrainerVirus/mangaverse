import { useEffect } from 'react';
import { AnimatedRouteOutlet } from '../components/shell/AnimatedRouteOutlet.js';
import { AppNotices } from '../components/AppNotices.js';
import { TitleBar } from '../components/shell/TitleBar.js';
import { createAppPlatformAdapter } from '../features/diagnostics/create-app-platform-adapter.js';

export function ReaderLayout({ children }: { children: React.ReactNode }) {
  // Chrome visibility is reset by the reader route's `beforeLoad` (hidden on open, #224).
  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-reader-active-ipc: telling the desktop host a chapter is open is an external-system boundary (workit ledger ruling mw3wt9l0-ff083a4d9cdf).
  useEffect(() => {
    // Desktop only (#215): main holds an update prompt while a chapter is open. The web
    // adapter has no `updates` section, so this is a no-op there.
    const updates = createAppPlatformAdapter().updates;
    void updates?.setReaderActive(true);
    return () => {
      void updates?.setReaderActive(false);
    };
  }, []);

  return (
    <>
      {/* Fixed at the top, so it can come first in the DOM: its Update pill is the first Tab
          stop, before the reader (this layout has no skip link). */}
      <TitleBar />
      {/* Below the desktop title bar; `--title-bar-height` is 0 without one and in fullscreen. */}
      <main className="below-title-bar fixed inset-x-0 bottom-0 overflow-hidden">
        {/* A column, not a bare outlet: a notice takes its own row instead of
            painting over the reader chrome, and the outlet keeps the rest. */}
        <div className="flex h-full flex-col">
          {/* Above the reader chrome (z-50): a storage failure outranks the
              controls that would otherwise paint over it. */}
          <AppNotices className="z-60" />
          {/* h-full, not the default min-h-full: the reader surface sizes with
              percentage heights, and an indefinite parent collapses it. */}
          <AnimatedRouteOutlet variant="reader" className="min-h-0 flex-1">
            {children}
          </AnimatedRouteOutlet>
        </div>
      </main>
    </>
  );
}
