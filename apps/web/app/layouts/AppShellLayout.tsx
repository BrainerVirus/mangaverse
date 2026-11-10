import { useEffect } from 'react';
import { useLayoutStore, detectDeviceLayout } from '../stores/useLayoutStore.js';
import { DesktopSidebar } from '../components/shell/DesktopSidebar.js';
import { TitleBar } from '../components/shell/TitleBar.js';
import { MobileBottomNav } from '../components/shell/MobileBottomNav.js';
import { AnimatedRouteOutlet } from '../components/shell/AnimatedRouteOutlet.js';
import { AppNotices } from '../components/AppNotices.js';
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
    <div
      data-app-shell
      className="flex overflow-hidden bg-background max-md:flex-col max-md:overflow-visible"
    >
      <AmbientBackdrop />
      {/* Keyboard users land on the shell first; the skip link is the only
          focusable element before the sidebar, so one Tab + Enter reaches the
          page content without walking the whole navigation. */}
      <a
        href="#main-content"
        className="sr-only rounded-control bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-60 focus:inline-flex focus:items-center pointer-coarse:focus:min-h-11"
      >
        Skip to content
      </a>
      {/* The desktop title bar is fixed at the top, so it can sit anywhere in the DOM: right
          after the skip link makes its Update pill the second Tab stop, before the page. */}
      <TitleBar />
      <DesktopSidebar />
      {/* `min-w-0` keeps a wide child from widening the shell's flex row; the
          content column then scrolls instead of pushing the page sideways.
          This column, not the window, is the scroll container, so the router
          restores it on Back through `data-scroll-restoration-id`. The reader
          has its own layout and scroll, so it is never tagged. */}
      <main
        id="main-content"
        tabIndex={-1}
        data-app-nav-offset
        data-scroll-restoration-id="app-main"
        className="scroll-fade-overlay-y min-w-0 flex-1 overflow-auto bg-background outline-none"
      >
        <AppNotices />
        <AnimatedRouteOutlet>{children}</AnimatedRouteOutlet>
      </main>
      <MobileBottomNav />
    </div>
  );
}
