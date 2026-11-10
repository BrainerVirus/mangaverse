/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ok } from '@app/shared';
import {
  TITLE_BAR_HEIGHT,
  type DesktopPlatformBridge,
  type PlatformUpdateState,
  type PlatformWindowChrome,
} from '@app/platform';

const navigate = vi.hoisted(() => vi.fn<(options: unknown) => Promise<void>>());
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

import { TitleBar, TitleBarView } from '../TitleBar.js';

const mac: PlatformWindowChrome = { platform: 'darwin', fullScreen: false, height: 36 };
const idle: PlatformUpdateState = {
  enabled: true,
  currentVersion: '1.0.0',
  lastCheckedAt: null,
  phase: { kind: 'idle' },
};
const withPhase = (phase: PlatformUpdateState['phase']): PlatformUpdateState => ({
  ...idle,
  phase,
});

function renderView(chrome: PlatformWindowChrome | null, update: PlatformUpdateState | null) {
  const onOpenUpdates = vi.fn<() => void>();
  const view = render(
    <TitleBarView chrome={chrome} update={update} onOpenUpdates={onOpenUpdates} />,
  );
  return { onOpenUpdates, container: view.container };
}

const strip = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-title-bar]');

afterEach(() => {
  cleanup();
  delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
});

describe('TitleBarView', () => {
  it('Given no chrome (the web build, or before main answers), Then no strip is drawn', () => {
    const { container } = renderView(null, idle);
    expect(strip(container)).toBeNull();
  });

  it('Given a fullscreen window, Then the strip hides, even with an update ready', () => {
    const { container } = renderView(
      { ...mac, fullScreen: true },
      withPhase({ kind: 'ready', version: '1.1.0' }),
    );
    expect(strip(container)).toBeNull();
  });

  it.each(['darwin', 'win32', 'linux'] as const)(
    'Given %s, Then the strip drags the window and names its platform for the insets',
    (platform) => {
      const { container } = renderView({ ...mac, platform }, idle);
      const element = strip(container)!;
      expect(element.classList.contains('title-bar')).toBe(true);
      expect(element.dataset.platform).toBe(platform);
      // Not a landmark: nothing to land on or get trapped in.
      expect(element.getAttribute('role')).toBeNull();
      expect(element.tagName).toBe('DIV');
    },
  );

  it.each([
    [withPhase({ kind: 'idle' })],
    [withPhase({ kind: 'checking' })],
    [withPhase({ kind: 'error', message: 'Offline.' })],
    [{ ...idle, enabled: false }],
    [null],
  ])('Given nothing to install, Then the strip has no button', (update) => {
    renderView(mac, update);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    [
      withPhase({ kind: 'downloading', version: '1.1.0', percent: 40, transferred: 4, total: 10 }),
      'Updating 40%',
    ],
    [withPhase({ kind: 'ready', version: '1.1.0' }), 'Restart to update'],
    [withPhase({ kind: 'installing', version: '1.1.0', queued: true }), 'Restart queued'],
  ])(
    'Given an update in flight, Then a clickable named button opens the updates page',
    (update, label) => {
      const { onOpenUpdates } = renderView(mac, update);
      const button = screen.getByRole('button', { name: new RegExp(`^${label}: .*1\\.1\\.0`) });
      expect(button.textContent).toBe(label);
      // The button opts out of the drag region, or the click would move the window instead.
      expect(button.closest('.app-region-no-drag')).not.toBeNull();
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(onOpenUpdates).toHaveBeenCalledTimes(1);
    },
  );
});

describe('TitleBar', () => {
  it('Given the desktop bridge, Then it draws from main, hides on fullscreen and navigates to updates', async () => {
    let emitChrome: (chrome: PlatformWindowChrome) => void = () => {};
    const bridge = {
      windowChromeGet: async () => ok(mac),
      onWindowChrome: (listener: (chrome: PlatformWindowChrome) => void) => {
        emitChrome = listener;
        return () => {};
      },
      updateGetState: async () => ok(withPhase({ kind: 'ready', version: '1.1.0' })),
      onUpdateState: () => () => {},
    };
    (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform =
      bridge as unknown as DesktopPlatformBridge;

    const { container } = render(<TitleBar />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /^Restart to update/ }));
    expect(navigate).toHaveBeenCalledWith({ to: '/settings/updates' });

    act(() => emitChrome({ ...mac, fullScreen: true }));
    expect(strip(container)).toBeNull();
  });
});

describe('title bar styles', () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(
    join(testDir, '../../../../../../packages/design-system/src/styles/globals.css'),
    'utf8',
  );
  const block = (selector: string) => {
    const start = css.indexOf(selector);
    return css.slice(start, css.indexOf('\n}\n', start));
  };

  it('Given a strip, Then the offset is the height main draws the native controls at', () => {
    expect(css).toMatch(
      new RegExp(
        `:root:has\\(\\[data-title-bar\\]\\) \\{\\s*--title-bar-height: ${TITLE_BAR_HEIGHT}px;`,
      ),
    );
    expect(css).toMatch(/:root \{\s*--title-bar-height: 0px;/);
  });

  it('Given the strip, Then it drags the window, and its controls do not', () => {
    expect(block('@utility title-bar {')).toContain('app-region: drag;');
    expect(block('@utility title-bar {')).toContain('height: var(--title-bar-height);');
    expect(block('@utility app-region-no-drag {')).toContain('app-region: no-drag;');
  });

  it('Given each platform, Then the strip keeps clear of its native controls', () => {
    const titleBar = block('@utility title-bar {');
    expect(titleBar).toMatch(/&\[data-platform="darwin"\] \{\s*padding-inline-start: 5rem;/);
    expect(titleBar).toMatch(
      /&:is\(\[data-platform="win32"\], \[data-platform="linux"\]\) \{\s*padding-inline-end: calc\(/,
    );
    expect(titleBar).toContain('env(titlebar-area-width');
  });

  it('Given the shell and the reader, Then both start below the strip', () => {
    expect(css).toContain(
      'padding-block-start: calc(env(safe-area-inset-top) + var(--title-bar-height));',
    );
    expect(block('@utility below-title-bar {')).toContain('top: var(--title-bar-height);');
  });
});
