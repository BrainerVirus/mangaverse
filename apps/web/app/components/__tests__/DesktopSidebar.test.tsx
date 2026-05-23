import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useLayoutStore } from '../../stores/useLayoutStore.js';
import { ThemeProvider } from '../../providers/theme-provider.js';

let currentPath = '/library';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => ({ location: { pathname: currentPath } }),
  useRouter: () => ({ navigate: vi.fn(), subscribe: () => () => {} }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock('@app/design-system', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Separator: () => null,
  cn: (...args: (string | undefined)[]) => args.filter(Boolean).join(' '),
}));

function renderWithProviders(ui: React.ReactElement) {
  return renderToString(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('DesktopSidebar', () => {
  beforeEach(() => {
    currentPath = '/library';
    useLayoutStore.setState({
      sidebarOpen: true,
      sidebarExpanded: false,
      deviceLayout: 'desktop',
    });
  });

  it('renders nav items', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: false });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('Library');
    expect(html).toContain('Search');
    expect(html).toContain('Settings');
  });

  it('renders secondary nav items when expanded', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('href="/backup"');
    expect(html).toContain('href="/migration"');
  });

  it('renders with collapsed width when not expanded', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: false });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('w-[48px]');
  });

  it('has aria-labels on nav links', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('aria-label');
    expect(html).toContain('aria-label="Library"');
  });

  it('has aria-labels on secondary nav links', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('aria-label="Backup"');
    expect(html).toContain('aria-label="Migration"');
    expect(html).toContain('aria-label="Diagnostics"');
    expect(html).toContain('aria-label="Onboarding"');
  });

  it('marks active secondary nav link as current page', async () => {
    currentPath = '/backup';
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Backup"');
  });

  it('renders collapse button with aria-label', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: false });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('aria-label="Collapse sidebar"');
  });
});
