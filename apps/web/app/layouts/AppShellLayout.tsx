import { useEffect } from 'react';
import { useLayoutStore, detectDeviceLayout } from '../stores/useLayoutStore.js';
import { DesktopSidebar } from '../components/shell/DesktopSidebar.js';
import { MobileBottomNav } from '../components/shell/MobileBottomNav.js';
import { AnimatedRouteOutlet } from '../components/shell/AnimatedRouteOutlet.js';

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const setDeviceLayout = useLayoutStore((s) => s.setDeviceLayout);

  useEffect(() => {
    setDeviceLayout(detectDeviceLayout());

    const handleResize = () => {
      setDeviceLayout(detectDeviceLayout());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setDeviceLayout]);

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
    <div className="flex h-screen overflow-hidden max-md:flex-col max-md:overflow-visible">
      <div className="hidden md:contents">
        <DesktopSidebar />
      </div>
      <main className="flex-1 overflow-auto max-md:pb-16">
        <AnimatedRouteOutlet>{children}</AnimatedRouteOutlet>
      </main>
      <div className="md:hidden">
        <MobileBottomNav />
      </div>
    </div>
  );
}
