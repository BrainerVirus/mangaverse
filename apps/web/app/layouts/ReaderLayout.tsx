import { useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore.js';
import { AnimatedRouteOutlet } from '../components/shell/AnimatedRouteOutlet.js';

export function ReaderLayout({ children }: { children: React.ReactNode }) {
  const { toggleReaderChrome, setReaderChrome } = useLayoutStore();

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-route-entry-reset: entering the reader resets chrome state that the last reader session left off, and Escape/f/F are window-level shortcuts — both need the mount lifecycle.
  useEffect(() => {
    setReaderChrome(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleReaderChrome();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleReaderChrome, setReaderChrome]);

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
