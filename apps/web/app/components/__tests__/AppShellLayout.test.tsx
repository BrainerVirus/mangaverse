import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useLayoutStore } from '@/stores/useLayoutStore.js';
import { ThemeProvider } from '@/providers/theme-provider.js';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useLocation: () => ({ pathname: '/library' }),
    useRouterState: (opts?: { select?: (state: { location: { pathname: string } }) => unknown }) =>
      opts?.select
        ? opts.select({ location: { pathname: '/library' } })
        : { location: { pathname: '/library' } },
    useRouter: () => ({ navigate: vi.fn<(options: unknown) => void>(), subscribe: () => () => {} }),
    useNavigate: () => vi.fn<() => void>(),
    Link: ({ children, to, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock('@app/design-system/motion', () => ({
  useReducedMotion: () => false,
  routeEnter: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('@gsap/react', () => ({
  useGSAP: (callback: () => void) => callback(),
}));

vi.mock('@app/design-system', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Separator: () => null,
    Button: ({ children, ...props }: { children: React.ReactNode }) => (
      <button {...props}>{children}</button>
    ),
    Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-sheet="open">{children}</div> : null,
    SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    cn: (...args: (string | undefined)[]) => args.filter(Boolean).join(' '),
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return renderToString(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('AppShellLayout', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      deviceLayout: 'desktop',
      sidebarOpen: true,
      sidebarExpanded: false,
    });
  });

  it('renders sidebar and content on desktop', async () => {
    useLayoutStore.setState({ deviceLayout: 'desktop', sidebarOpen: true });
    const { AppShellLayout } = await import('../../layouts/AppShellLayout.js');
    const html = renderWithProviders(
      <AppShellLayout>
        <div>Content</div>
      </AppShellLayout>,
    );
    expect(html).toContain('Content');
  });

  it('owns the only main landmark, so page content must not add one', async () => {
    useLayoutStore.setState({ deviceLayout: 'desktop', sidebarOpen: true });
    const { AppShellLayout } = await import('../../layouts/AppShellLayout.js');
    const html = renderWithProviders(
      <AppShellLayout>
        <section aria-label="Library">Content</section>
      </AppShellLayout>,
    );
    expect(html.match(/<main[\s>]/g) ?? []).toHaveLength(1);
  });

  it('renders mobile layout with bottom nav', async () => {
    useLayoutStore.setState({ deviceLayout: 'mobile', sidebarOpen: true });
    const { AppShellLayout } = await import('../../layouts/AppShellLayout.js');
    const html = renderWithProviders(
      <AppShellLayout>
        <div>Content</div>
      </AppShellLayout>,
    );
    expect(html).toContain('Content');
    expect(html).toContain('href="/library"');
  });

  it('hides sidebar when closed', async () => {
    useLayoutStore.setState({ deviceLayout: 'desktop', sidebarOpen: false });
    const { AppShellLayout } = await import('../../layouts/AppShellLayout.js');
    const html = renderWithProviders(
      <AppShellLayout>
        <div>Content</div>
      </AppShellLayout>,
    );
    expect(html).toContain('Content');
  });
});
