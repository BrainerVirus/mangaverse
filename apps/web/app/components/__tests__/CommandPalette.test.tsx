import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ThemeProvider } from '@/providers/theme-provider.js';

const storeState = vi.hoisted(() => ({
  layout: { deviceLayout: 'desktop' },
  palette: {
    isOpen: false,
    query: '',
    selectedIndex: 0,
    close: vi.fn<() => void>(),
    setQuery: vi.fn<(query: string) => void>(),
    moveSelection: vi.fn<(delta: number, maxIndex?: number) => void>(),
    setSelectedIndex: vi.fn<(index: number) => void>(),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn<() => void>(),
}));

vi.mock('@app/design-system', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('../../stores/useLayoutStore', () => ({
  useLayoutStore: () => storeState.layout,
}));

vi.mock('../../stores/useCommandPaletteStore', () => ({
  useCommandPaletteStore: () => storeState.palette,
}));

vi.mock('../../providers/platform-provider.js', () => ({
  usePlatform: () => ({ capabilities: {}, runtime: 'web' as const }),
}));

vi.mock('@app/motion', () => ({
  useReducedMotion: () => false,
  commandPaletteEnter: vi.fn<(...args: unknown[]) => unknown>(),
  commandPaletteExit: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('@gsap/react', () => ({
  useGSAP: (callback: () => void) => callback(),
}));

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

function renderWithProviders(ui: React.ReactElement) {
  return renderToString(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('CommandPalette', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    storeState.layout.deviceLayout = 'desktop';
    storeState.palette.isOpen = false;
    storeState.palette.query = '';
    storeState.palette.selectedIndex = 0;
    storeState.palette.close.mockClear();
    storeState.palette.setQuery.mockClear();
    storeState.palette.moveSelection.mockClear();
    // Mirrors the real store's functional set, so a keydown handler that fires
    // twice shows up as a two-item jump instead of an invisible second call.
    storeState.palette.moveSelection.mockImplementation((delta, maxIndex) => {
      storeState.palette.selectedIndex = Math.max(
        0,
        Math.min(storeState.palette.selectedIndex + delta, maxIndex ?? Infinity),
      );
    });
    storeState.palette.setSelectedIndex.mockClear();
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

  it('does not render when closed', async () => {
    storeState.palette.isOpen = false;
    storeState.layout.deviceLayout = 'desktop';
    const { CommandPalette } = await import('../shell/CommandPalette.js');
    const html = renderWithProviders(<CommandPalette />);
    expect(html).not.toContain('Type a command');
  });

  it('does not render on mobile even when open', async () => {
    storeState.palette.isOpen = true;
    storeState.layout.deviceLayout = 'mobile';
    const { CommandPalette } = await import('../shell/CommandPalette.js');
    const html = renderWithProviders(<CommandPalette />);
    expect(html).not.toContain('Type a command');
  });

  it('renders the command input when open on desktop', async () => {
    storeState.palette.isOpen = true;
    storeState.palette.query = '';
    storeState.palette.selectedIndex = 0;
    storeState.layout.deviceLayout = 'desktop';
    const { CommandPalette } = await import('../shell/CommandPalette.js');
    const html = renderWithProviders(<CommandPalette />);
    expect(html).toContain('Search commands');
  });

  const openPalette = async () => {
    storeState.palette.isOpen = true;
    storeState.palette.query = '';
    storeState.palette.selectedIndex = 0;
    storeState.layout.deviceLayout = 'desktop';
    const { CommandPalette } = await import('../shell/CommandPalette.js');

    const render = async () => {
      await act(async () => {
        root.render(
          <ThemeProvider>
            <CommandPalette />
          </ThemeProvider>,
        );
      });
    };
    await render();
    // The built-in commands register in an effect and the mocked store never
    // notifies, so render once more for `registry.search` to see them.
    await render();
  };

  it('uses the shared scrim utility while open', async () => {
    await openPalette();
    expect(container.querySelector('.glass-scrim')).toBeTruthy();
  });

  it('closes on Escape and moves selection with arrow keys', async () => {
    await openPalette();

    const overlay = container.querySelector('.fixed.inset-0');
    expect(overlay).toBeTruthy();

    await act(async () => {
      overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(storeState.palette.moveSelection).toHaveBeenCalledWith(1, expect.any(Number));

    await act(async () => {
      overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(storeState.palette.close).toHaveBeenCalled();
  });

  it('moves the selection by one item per arrow key while the input holds focus', async () => {
    await openPalette();

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search commands"]');
    expect(input).toBeTruthy();
    input?.focus();

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(storeState.palette.selectedIndex).toBe(1);

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(storeState.palette.selectedIndex).toBe(0);
  });

  it('closes once on Enter while the input holds focus', async () => {
    await openPalette();

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search commands"]');
    input?.focus();

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(storeState.palette.close).toHaveBeenCalledTimes(1);
  });
});
