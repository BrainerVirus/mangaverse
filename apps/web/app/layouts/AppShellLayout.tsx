import { useEffect } from 'react';
import { useLayoutStore, detectDeviceLayout } from '../stores/useLayoutStore.js';
import { DesktopSidebar } from '../components/shell/DesktopSidebar.js';
import { MobileBottomNav } from '../components/shell/MobileBottomNav.js';
import { AnimatedRouteOutlet } from '../components/shell/AnimatedRouteOutlet.js';
import { PersistenceErrorBanner } from '../components/PersistenceErrorBanner.js';
import { AmbientBackdrop } from '@app/design-system';

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const setDeviceLayout = useLayoutStore((s) => s.setDeviceLayout);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-viewport: the device layout is detected from the browser's viewport on mount and on resize; window is an external system and the initial read must happen after hydration to match the server markup.
  useEffect(() => {
    setDeviceLayout(detectDeviceLayout());

    const handleResize = () => {
      setDeviceLayout(detectDeviceLayout());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setDeviceLayout]);

  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-window-keydown: Cmd/Ctrl+B is a window-level shortcut; binding it to a focused element would drop it whenever focus sits outside the shell.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  return (
    <div className="flex h-screen overflow-hidden bg-background max-md:flex-col max-md:overflow-visible">
      <AmbientBackdrop />
      <DesktopSidebar />
      <main className="flex-1 overflow-auto bg-background max-md:pb-16">
        <PersistenceErrorBanner />
        <AnimatedRouteOutlet>{children}</AnimatedRouteOutlet>
      </main>
      <MobileBottomNav />
    </div>
  );
}
