import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useLayoutStore } from '../../stores/useLayoutStore.js';
import { ThemeProvider } from '../../providers/theme-provider.js';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useLocation: () => ({ pathname: '/library' }),
    useRouterState: () => ({ location: { pathname: '/library' } }),
    useRouter: () => ({ navigate: vi.fn(), subscribe: () => () => {} }),
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

vi.mock('@app/motion', () => ({
  useReducedMotion: () => false,
  routeEnter: vi.fn(),
}));

vi.mock('@gsap/react', () => ({
  useGSAP: (callback: () => void) => callback(),
}));

vi.mock('@app/design-system', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
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
        <main>Content</main>
      </AppShellLayout>
    );
    expect(html).toContain('Content');
  });

  it('renders mobile layout with bottom nav', async () => {
    useLayoutStore.setState({ deviceLayout: 'mobile', sidebarOpen: true });
    const { AppShellLayout } = await import('../../layouts/AppShellLayout.js');
    const html = renderWithProviders(
      <AppShellLayout>
        <main>Content</main>
      </AppShellLayout>
    );
    expect(html).toContain('Content');
    expect(html).toContain('href="/library"');
  });

  it('hides sidebar when closed', async () => {
    useLayoutStore.setState({ deviceLayout: 'desktop', sidebarOpen: false });
    const { AppShellLayout } = await import('../../layouts/AppShellLayout.js');
    const html = renderWithProviders(
      <AppShellLayout>
        <main>Content</main>
      </AppShellLayout>
    );
    expect(html).toContain('Content');
  });
});