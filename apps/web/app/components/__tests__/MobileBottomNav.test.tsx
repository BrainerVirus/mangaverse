import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useLayoutStore } from '@/stores/useLayoutStore.js';
import { ThemeProvider } from '@/providers/theme-provider.js';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

vi.mock('@tanstack/react-router', () => ({
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
}));

vi.mock('@app/design-system', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  GlassSurface: ({
    children,
    level,
    className,
  }: {
    children: React.ReactNode;
    level: string;
    className?: string;
  }) => (
    <div data-glass-tier={level} className={`glass-${level} ${className ?? ''}`}>
      {children}
    </div>
  ),
  Separator: () => null,
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-sheet="open">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  cn: (...args: (string | undefined)[]) => args.filter(Boolean).join(' '),
}));

function renderWithProviders(ui: React.ReactElement) {
  return renderToString(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('MobileBottomNav', () => {
  beforeEach(() => {
    useLayoutStore.setState({ deviceLayout: 'mobile' });
  });

  it('renders primary tabs', async () => {
    useLayoutStore.setState({ deviceLayout: 'mobile' });
    const { MobileBottomNav } = await import('../shell/MobileBottomNav.js');
    const html = renderWithProviders(<MobileBottomNav />);
    expect(html).toContain('Library');
    expect(html).toContain('Search');
    expect(html).toContain('Settings');
  });

  it('renders hamburger button with aria-label', async () => {
    useLayoutStore.setState({ deviceLayout: 'mobile' });
    const { MobileBottomNav } = await import('../shell/MobileBottomNav.js');
    const html = renderWithProviders(<MobileBottomNav />);
    expect(html).toContain('aria-label');
    expect(html).toContain('Open navigation menu');
  });

  it('renders with fixed bottom positioning', async () => {
    useLayoutStore.setState({ deviceLayout: 'mobile' });
    const { MobileBottomNav } = await import('../shell/MobileBottomNav.js');
    const html = renderWithProviders(<MobileBottomNav />);
    expect(html).toContain('fixed bottom-0');
    expect(html).toContain('min-h-14');
  });

  it('renders the bottom navigation as thick glass', async () => {
    const { MobileBottomNav } = await import('../shell/MobileBottomNav.js');
    const html = renderWithProviders(<MobileBottomNav />);

    expect(html).toContain('data-glass-tier="thick"');
    expect(html).toContain('glass-thick');
  });
});
