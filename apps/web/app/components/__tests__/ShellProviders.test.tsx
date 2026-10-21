import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ShellProviders } from '../ShellProviders.js';
import { useCommandPaletteStore } from '@/stores/useCommandPaletteStore';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useLocation: () => ({ pathname: '/library' }),
    useRouter: () => ({ navigate: vi.fn<(options: unknown) => void>(), subscribe: () => () => {} }),
    useRouterState: (opts?: { select?: (state: { location: { pathname: string } }) => unknown }) =>
      opts?.select
        ? opts.select({ location: { pathname: '/library' } })
        : { location: { pathname: '/library' } },
    useNavigate: () => vi.fn<() => void>(),
    Link: ({ children, to, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock('../../providers/local-db-provider.js', () => ({
  LocalDbProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocalDb: () => null,
  useLocalDbStatus: () => 'ready' as const,
  useLocalDbError: () => null,
  useLocalDbRetry: () => vi.fn<() => void>(),
  usePersistenceError: () => null,
  useRetryPersistence: () => vi.fn<() => void>(),
}));

vi.mock('@app/motion', () => ({
  useReducedMotion: () => false,
  getReducedMotionPreference: () => false,
  setInAppReducedMotionPreference: vi.fn<(reduced: boolean) => void>(),
  routeEnter: vi.fn<(...args: unknown[]) => unknown>(),
  commandPaletteEnter: vi.fn<(...args: unknown[]) => unknown>(),
  commandPaletteExit: vi.fn<(...args: unknown[]) => unknown>(),
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
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useCommandPaletteStore.setState({ isOpen: false, query: '', selectedIndex: 0 });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders children without crashing', () => {
    const html = renderToString(
      <ShellProviders>
        <div>Hello</div>
      </ShellProviders>,
    );
    expect(html).toContain('Hello');
  });

  it('opens the command palette on Cmd+K', async () => {
    await act(async () => {
      root.render(
        <ShellProviders>
          <div>Hello</div>
        </ShellProviders>,
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
      );
    });

    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
  });
});
