import { useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore.js';
import { AnimatedRouteOutlet } from '../components/shell/AnimatedRouteOutlet.js';
import { createAppPlatformAdapter } from '../features/diagnostics/create-app-platform-adapter.js';

export function ReaderLayout({ children }: { children: React.ReactNode }) {
  const setReaderChrome = useLayoutStore((s) => s.setReaderChrome);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-route-entry-reset: entering the reader resets chrome state that the last reader session left off, which needs the mount lifecycle.
  useEffect(() => {
    setReaderChrome(true);
    // Desktop only (#215): main holds an update prompt while a chapter is open. The web
    // adapter has no `updates` section, so this is a no-op there.
    const updates = createAppPlatformAdapter().updates;
    void updates?.setReaderActive(true);
    return () => {
      void updates?.setReaderActive(false);
    };
  }, [setReaderChrome]);

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* h-full, not the default min-h-full: the reader surface sizes with
          percentage heights, and an indefinite parent collapses it. */}
      <AnimatedRouteOutlet variant="reader" className="h-full">
        {children}
      </AnimatedRouteOutlet>
    </main>
  );
}
