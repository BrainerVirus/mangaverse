import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
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

/**
 * Client render on purpose: the store's SSR snapshot is its initial state, so an
 * SSR render cannot show the collapsed rail.
 */
async function renderSidebar(expanded: boolean) {
  useLayoutStore.setState({
    sidebarOpen: true,
    sidebarExpanded: expanded,
    deviceLayout: 'desktop',
  });
  const { DesktopSidebar } = await import('../DesktopSidebar.js');
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
  const classesOf = (label: string) =>
    container.querySelector(`a[aria-label="${label}"]`)?.className ?? '';
  return {
    container,
    classesOf,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

// `buttonVariants` alone is not a button: without the shared base the link loses
// `inline-flex items-center` and the icon stacks above the label.
describe('DesktopSidebar nav link classes', () => {
  beforeEach(() => {
    useLayoutStore.setState({ sidebarOpen: true, sidebarExpanded: true, deviceLayout: 'desktop' });
  });

  it('lays out the icon and label inline when expanded', async () => {
    const { classesOf, cleanup } = await renderSidebar(true);
    expect(classesOf('Library')).toContain('inline-flex');
    expect(classesOf('Library')).toContain('items-center');
    expect(classesOf('Library')).toContain('justify-start');
    cleanup();
  });

  it('fills the current route with the sidebar accent and tints the rest on hover', async () => {
    const { classesOf, cleanup } = await renderSidebar(true);
    expect(classesOf('Library')).toContain('bg-sidebar-accent');
    expect(classesOf('Library')).not.toContain('bg-secondary');
    expect(classesOf('Search')).not.toContain('bg-sidebar-accent ');
    expect(classesOf('Search')).toContain('hover:bg-sidebar-accent/60');
    cleanup();
  });

  it('centres the icon and keeps the row height on the collapsed rail', async () => {
    const { classesOf, cleanup } = await renderSidebar(false);
    expect(classesOf('Library')).toContain('inline-flex');
    expect(classesOf('Library')).toContain('justify-center');
    expect(classesOf('Library')).toContain('h-10');
    cleanup();
  });

  it('shows the group labels when expanded', async () => {
    const { container, cleanup } = await renderSidebar(true);
    const labels = [...container.querySelectorAll('nav p')].map((node) => node.textContent);
    expect(labels).toEqual(['Browse', 'Manage']);
    cleanup();
  });

  it('hides the group labels on the collapsed rail but keeps every row', async () => {
    const { container, cleanup } = await renderSidebar(false);
    expect(container.querySelectorAll('nav p')).toHaveLength(0);
    expect(container.querySelectorAll('nav a')).toHaveLength(5);
    expect(container.querySelector('ul[aria-label="Browse"]')).not.toBeNull();
    cleanup();
  });
});
