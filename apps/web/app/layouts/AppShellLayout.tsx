import { useEffect } from 'react';
import { useLayoutStore, detectDeviceLayout } from '../stores/useLayoutStore.js';
import { DesktopSidebar } from '../components/shell/DesktopSidebar.js';
import { MobileBottomNav } from '../components/shell/MobileBottomNav.js';

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { deviceLayout, toggleSidebar } = useLayoutStore();
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

  const isDesktopOrTablet = deviceLayout === 'desktop' || deviceLayout === 'tablet';

  if (isDesktopOrTablet) {
    return (
      <div className="flex h-screen overflow-hidden">
        <DesktopSidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <main className="flex-1 overflow-auto pb-16">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}