import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
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
    useRouter: () => ({ navigate: vi.fn(), subscribe: () => () => {} }),
    useRouterState: () => ({ location: { pathname: '/library' } }),
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

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
    Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    cn: (...args: (string | undefined)[]) => args.filter(Boolean).join(' '),
  };
});

describe('ShellProviders', () => {
  it('renders children without crashing', async () => {
    const { ShellProviders } = await import('../ShellProviders.js');
    const html = renderToString(
      <ThemeProvider>
        <ShellProviders>
          <div>Hello</div>
        </ShellProviders>
      </ThemeProvider>
    );
    expect(html).toContain('Hello');
  });
});