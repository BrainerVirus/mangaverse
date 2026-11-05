import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { renderToString } from 'react-dom/server';
import { useLayoutStore } from '@/stores/useLayoutStore.js';
import { ThemeProvider } from '@/providers/theme-provider.js';

let currentPath = '/library';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (opts?: { select?: (state: { location: { pathname: string } }) => unknown }) =>
    opts?.select
      ? opts.select({ location: { pathname: currentPath } })
      : { location: { pathname: currentPath } },
  useRouter: () => ({ navigate: vi.fn<(options: unknown) => void>(), subscribe: () => () => {} }),
  useNavigate: () => vi.fn<() => void>(),
  Link: ({ children, to, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@app/design-system', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Separator: () => null,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  buttonVariants: {
    default: 'btn-default',
    ghost: 'btn-ghost',
    secondary: 'btn-secondary',
  },
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
      sidebarExpanded: true,
      deviceLayout: 'desktop',
    });
  });

  it('renders nav items', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: false });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('Discover');
    expect(html).toContain('Library');
    expect(html).toContain('Search');
    expect(html).toContain('Settings');
  });

  it('renders stable light-theme toggle icon during SSR', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('aria-label="Toggle theme"');
    expect(html).toContain('lucide-moon');
  });

  it('groups the destinations under Browse and Manage', async () => {
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    expect(html).toContain('aria-label="Browse"');
    expect(html).toContain('aria-label="Manage"');
    expect(html).toContain('type-micro uppercase text-muted-foreground');
    expect(hrefs).toEqual(['/discover', '/library', '/search', '/extensions', '/settings']);
    expect(html.indexOf('aria-label="Browse"')).toBeLessThan(html.indexOf('href="/discover"'));
    expect(html.indexOf('href="/search"')).toBeLessThan(html.indexOf('aria-label="Manage"'));
    expect(html.indexOf('aria-label="Manage"')).toBeLessThan(html.indexOf('href="/extensions"'));
  });

  it('leaves the tools the Settings hub links to out of the sidebar', async () => {
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);

    for (const label of [
      'Backup',
      'Onboarding',
      'Advanced',
      'Theme editor',
      'Diagnostics',
      'Migration',
    ]) {
      expect(html).not.toContain(`aria-label="${label}"`);
    }
    expect(html).not.toContain('href="/backup"');
    expect(html).not.toContain('href="/advanced');
  });

  it('renders with expanded width by default on desktop', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('w-55');
  });

  it('renders with collapsed width when not expanded', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: false });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        <ThemeProvider>
          <DesktopSidebar />
        </ThemeProvider>,
      );
    });
    const asideClass = container.querySelector('aside')?.className ?? '';
    expect(asideClass).toContain('w-13');
    root.unmount();
    container.remove();
  });

  it('has aria-labels on nav links', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('aria-label');
    expect(html).toContain('aria-label="Library"');
  });

  it('marks the active route as the current page with the sidebar accent fill', async () => {
    currentPath = '/extensions';
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];

    expect(current).toHaveLength(1);
    expect(current[0]).toContain('aria-label="Extensions"');
    expect(current[0]).toContain('bg-sidebar-accent');
  });

  it('renders collapse button with aria-label', async () => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: false });
    const { DesktopSidebar } = await import('../shell/DesktopSidebar.js');
    const html = renderWithProviders(<DesktopSidebar />);
    expect(html).toContain('aria-label="Collapse sidebar"');
  });
});
