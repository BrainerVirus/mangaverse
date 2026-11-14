/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ok } from '@app/shared';
import type { DesktopPlatformBridge, PlatformUpdateState } from '@app/platform';

const router = vi.hoisted(() => ({
  routeIds: ['__root__', '/library'] as string[],
  /** The URL, which moves as soon as a navigation starts. */
  pathname: '/library',
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn<(options: unknown) => Promise<void>>(),
  useLocation: () => ({ pathname: router.pathname }),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: router.pathname }, resolvedLocation: undefined }),
  useMatches: ({ select }: { select: (matches: { routeId: string }[]) => unknown }) =>
    select(router.routeIds.map((routeId) => ({ routeId }))),
}));
vi.mock('../../components/shell/DesktopSidebar.js', () => ({
  DesktopSidebar: () => <a href="/library">Library</a>,
}));
vi.mock('../../components/shell/MobileBottomNav.js', () => ({ MobileBottomNav: () => null }));
vi.mock('../../components/shell/AnimatedRouteOutlet.js', () => ({
  AnimatedRouteOutlet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/AppNotices.js', () => ({ AppNotices: () => null }));
vi.mock('@app/design-system', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AmbientBackdrop: () => null,
}));
vi.mock('../../features/diagnostics/create-app-platform-adapter.js', () => ({
  createAppPlatformAdapter: () => ({ updates: undefined }),
}));

import { AppLayout } from '../AppLayout.js';

const ready: PlatformUpdateState = {
  enabled: true,
  currentVersion: '1.0.0',
  lastCheckedAt: null,
  phase: { kind: 'ready', version: '1.1.0' },
};

function installBridge() {
  const bridge = {
    windowChromeGet: async () => ok({ platform: 'darwin', fullScreen: false, height: 28 }),
    onWindowChrome: () => () => {},
    updateGetState: async () => ok(ready),
    onUpdateState: () => () => {},
  };
  (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform =
    bridge as unknown as DesktopPlatformBridge;
}

afterEach(() => {
  cleanup();
  router.routeIds = ['__root__', '/library'];
  router.pathname = '/library';
  delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
});

/** Tab order for these layouts is DOM order: nothing here sets a positive `tabindex`. */
const stops = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('a[href], button, [tabindex]')].map(
    (element) => element.getAttribute('aria-label') ?? element.textContent,
  );

describe('the title bar in the Tab order', () => {
  it('Given the app shell, Then the skip link comes first, then the Update pill, then the page', async () => {
    installBridge();
    const { container } = render(
      <AppLayout>
        <button type="button">Page action</button>
      </AppLayout>,
    );
    await act(async () => {});

    const order = stops(container);
    expect(order[0]).toBe('Skip to content');
    // Hidden until focus, then below the title bar, in full, on design-system tokens.
    const skip = container.querySelector<HTMLElement>('a[href="#main-content"]')!;
    expect(skip.classList.contains('skip-link')).toBe(true);
    expect(skip.classList.contains('sr-only')).toBe(false);
    for (const token of ['rounded-control', 'bg-primary', 'shadow-lg', 'focus:ring-2']) {
      expect(skip.classList.contains(token)).toBe(true);
    }
    expect(order[1]).toMatch(/^Restart to update: install MangaVerse 1\.1\.0/);
    expect(order.indexOf('Page action')).toBeGreaterThan(1);
    expect(order.indexOf('Library')).toBeGreaterThan(1);
    // The pill is also before the main landmark in the document.
    const pill = container.querySelector('[data-title-bar] button')!;
    const main = container.querySelector('main')!;
    expect(pill.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Given the reader, Then the Update pill is the first stop and comes before the reader', async () => {
    installBridge();
    router.routeIds = ['__root__', '/reader/$chapterId'];
    const { container } = render(
      <AppLayout>
        <button type="button">Reader control</button>
      </AppLayout>,
    );
    await act(async () => {});

    const order = stops(container);
    expect(order[0]).toMatch(/^Restart to update: install MangaVerse 1\.1\.0/);
    expect(order.indexOf('Reader control')).toBeGreaterThan(0);
    const strip = container.querySelector('[data-title-bar]')!;
    const main = container.querySelector('main')!;
    expect(strip.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Given the web build (no bridge), Then there is no strip and the skip link stays first', () => {
    const { container } = render(
      <AppLayout>
        <button type="button">Page action</button>
      </AppLayout>,
    );
    expect(container.querySelector('[data-title-bar]')).toBeNull();
    expect(stops(container)[0]).toBe('Skip to content');
  });
});

describe('moving between the shell and the reader', () => {
  function Page({ children }: { children: ReactNode }) {
    return <button type="button">{children}</button>;
  }

  it('Given the desktop strip, When the reader opens and closes, Then the strip is never removed', async () => {
    installBridge();
    const { container, rerender } = render(
      <AppLayout>
        <Page>Detail</Page>
      </AppLayout>,
    );
    await act(async () => {});
    const strip = container.querySelector('[data-title-bar]');
    expect(strip).not.toBeNull();

    const removed: Node[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) removed.push(...record.removedNodes);
    });
    observer.observe(container, { childList: true, subtree: true });

    router.routeIds = ['__root__', '/reader/$chapterId'];
    rerender(
      <AppLayout>
        <Page>Reader</Page>
      </AppLayout>,
    );
    expect(container.querySelector('main')?.closest('[data-app-shell]')).toBeNull();
    router.routeIds = ['__root__', '/manga/$id'];
    rerender(
      <AppLayout>
        <Page>Detail</Page>
      </AppLayout>,
    );
    await act(async () => {});
    observer.disconnect();

    expect(container.querySelector('[data-title-bar]')).toBe(strip);
    expect(removed.some((node) => node === strip || node.contains(strip))).toBe(false);
  });

  it('Given the URL already points at the reader, While its route is pending, Then the page on screen keeps the shell', () => {
    // The matches on screen are still the detail page's: the layout follows them, not the URL.
    router.pathname = '/reader/chapter-1';
    router.routeIds = ['__root__', '/manga/$id'];
    const { container } = render(
      <AppLayout>
        <Page>Detail</Page>
      </AppLayout>,
    );
    const page = container.querySelector('button')!;
    expect(page.closest('[data-app-shell]')).not.toBeNull();
    expect(container.querySelector('main.below-title-bar')).toBeNull();
  });
});
