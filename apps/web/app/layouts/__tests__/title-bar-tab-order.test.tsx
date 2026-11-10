/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { ok } from '@app/shared';
import type { DesktopPlatformBridge, PlatformUpdateState } from '@app/platform';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn<(options: unknown) => Promise<void>>(),
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

import { AppShellLayout } from '../AppShellLayout.js';
import { ReaderLayout } from '../ReaderLayout.js';

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
      <AppShellLayout>
        <button type="button">Page action</button>
      </AppShellLayout>,
    );
    await act(async () => {});

    const order = stops(container);
    expect(order[0]).toBe('Skip to content');
    expect(order[1]).toMatch(/^Restart to update: 1\.1\.0/);
    expect(order.indexOf('Page action')).toBeGreaterThan(1);
    expect(order.indexOf('Library')).toBeGreaterThan(1);
    // The pill is also before the main landmark in the document.
    const pill = container.querySelector('[data-title-bar] button')!;
    const main = container.querySelector('main')!;
    expect(pill.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Given the reader, Then the Update pill is the first stop and comes before the reader', async () => {
    installBridge();
    const { container } = render(
      <ReaderLayout>
        <button type="button">Reader control</button>
      </ReaderLayout>,
    );
    await act(async () => {});

    const order = stops(container);
    expect(order[0]).toMatch(/^Restart to update: 1\.1\.0/);
    expect(order.indexOf('Reader control')).toBeGreaterThan(0);
    const strip = container.querySelector('[data-title-bar]')!;
    const main = container.querySelector('main')!;
    expect(strip.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Given the web build (no bridge), Then there is no strip and the skip link stays first', () => {
    const { container } = render(
      <AppShellLayout>
        <button type="button">Page action</button>
      </AppShellLayout>,
    );
    expect(container.querySelector('[data-title-bar]')).toBeNull();
    expect(stops(container)[0]).toBe('Skip to content');
  });
});
