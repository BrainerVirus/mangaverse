import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider } from '../../providers/theme-provider.js';

const storeState = vi.hoisted(() => ({
  layout: { deviceLayout: 'desktop' },
  palette: {
    isOpen: false,
    query: '',
    selectedIndex: 0,
    close: vi.fn(),
    setQuery: vi.fn(),
    moveSelection: vi.fn(),
    setSelectedIndex: vi.fn(),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
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

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  writable: true,
});

function renderWithProviders(ui: React.ReactElement) {
  return renderToString(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('CommandPalette', () => {
  beforeEach(() => {
    storeState.layout.deviceLayout = 'desktop';
    storeState.palette.isOpen = false;
    storeState.palette.query = '';
    storeState.palette.selectedIndex = 0;
    storeState.palette.close.mockClear();
    storeState.palette.setQuery.mockClear();
    storeState.palette.moveSelection.mockClear();
    storeState.palette.setSelectedIndex.mockClear();
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
    expect(html).toContain('Type a command');
  });
});
