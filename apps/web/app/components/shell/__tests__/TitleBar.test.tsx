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
  TITLE_BAR_HEIGHTS,
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
  const onInstall = vi.fn<() => void>();
  const view = render(
    <TitleBarView
      chrome={chrome}
      update={update}
      onOpenUpdates={onOpenUpdates}
      onInstall={onInstall}
    />,
  );
  return { onOpenUpdates, onInstall, container: view.container };
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
      'downloading',
      withPhase({ kind: 'downloading', version: '1.1.0', percent: 40, transferred: 4, total: 10 }),
      '40%',
      'Downloading update 1.1.0, 40%: open update settings',
      'download',
      'neutral',
      'settings',
    ],
    [
      'ready',
      withPhase({ kind: 'ready', version: '1.1.0' }),
      'Restart to update',
      'Restart to update: install MangaVerse 1.1.0 now',
      'rotate',
      'attention',
      'install',
    ],
    [
      'queued',
      withPhase({ kind: 'installing', version: '1.1.0', queued: true }),
      'Restart queued',
      'Restart queued: MangaVerse 1.1.0 installs when you finish reading',
      'clock',
      'neutral',
      'none',
    ],
    [
      'restarting',
      withPhase({ kind: 'installing', version: '1.1.0', queued: false }),
      'Restarting…',
      'Restarting…: installing MangaVerse 1.1.0',
      'rotate',
      'neutral',
      'none',
    ],
  ])(
    'Given an update %s, Then a pill named for what a click does acts on it',
    (_phase, update, label, name, icon, tone, click) => {
      const { onOpenUpdates, onInstall } = renderView(mac, update);
      const button = screen.getByRole('button', { name });
      expect(button.textContent).toBe(label.replace('…', '...'));
      const layer = (name: string) => button.querySelector(`[data-pill-icon="${name}"]`)!;
      for (const name of ['download', 'check', 'rotate', 'clock']) {
        expect(layer(name).classList.contains('opacity-0')).toBe(name !== icon);
      }
      expect(button.dataset.tone).toBe(tone);
      // The button opts out of the drag region, or the click would move the window instead.
      expect(button.closest('.app-region-no-drag')).not.toBeNull();
      button.focus();
      fireEvent.click(button);
      // Pressing it never costs the keyboard user their place, whatever it does.
      expect(document.activeElement).toBe(button);
      expect(onOpenUpdates).toHaveBeenCalledTimes(click === 'settings' ? 1 : 0);
      expect(onInstall).toHaveBeenCalledTimes(click === 'install' ? 1 : 0);
      expect(button.getAttribute('aria-disabled')).toBe(click === 'none' ? 'true' : null);
    },
  );

  it('Given a restart is waiting, Then the pill is the filled primary call to action', () => {
    renderView(mac, withPhase({ kind: 'ready', version: '1.1.0' }));
    const button = screen.getByRole('button');
    expect(button.classList.contains('bg-primary')).toBe(true);
    expect(button.classList.contains('text-primary-foreground')).toBe(true);
    // The ring is only drawn while a download runs.
    expect(button.querySelector('[data-progress-ring]')).toBeNull();
  });

  it.each([0, 40, 100])(
    'Given a download at %i%, Then the ring arc is offset by the share still to come',
    (percent) => {
      renderView(
        mac,
        withPhase({ kind: 'downloading', version: '1.1.0', percent, transferred: 4, total: 10 }),
      );
      const arc = screen.getByRole('button').querySelector('[data-progress-arc]')!;
      const circumference = 2 * Math.PI * 14;
      expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(circumference, 5);
      expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(
        circumference * (1 - percent / 100),
        5,
      );
      // The ring is moved by GSAP now (UpdatePill), not by a CSS transition.
      expect(arc.getAttribute('class')).toBeNull();
    },
  );

  it('Given a restart in progress, Then the label ends in three dots and the spinner glyph shows', () => {
    renderView(mac, withPhase({ kind: 'installing', version: '1.1.0', queued: false }));
    const button = screen.getByRole('button');
    expect(button.querySelectorAll('[data-pill-dot]')).toHaveLength(3);
    expect(button.querySelector('[data-pill-icon="rotate"]')!.classList.contains('opacity-0')).toBe(
      false,
    );
  });
});

describe('TitleBar', () => {
  function installBridge(phase: PlatformUpdateState['phase']) {
    let emitChrome: (chrome: PlatformWindowChrome) => void = () => {};
    const updateInstall = vi.fn<() => Promise<unknown>>(async () => ok(undefined));
    const bridge = {
      windowChromeGet: async () => ok(mac),
      onWindowChrome: (listener: (chrome: PlatformWindowChrome) => void) => {
        emitChrome = listener;
        return () => {};
      },
      updateGetState: async () => ok(withPhase(phase)),
      onUpdateState: () => () => {},
      updateInstall,
    };
    (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform =
      bridge as unknown as DesktopPlatformBridge;
    return { updateInstall, emitChrome: (chrome: PlatformWindowChrome) => emitChrome(chrome) };
  }

  it('Given a download, Then clicking the pill opens the updates page and hides on fullscreen', async () => {
    const { emitChrome, updateInstall } = installBridge({
      kind: 'downloading',
      version: '1.1.0',
      percent: 40,
      transferred: 4,
      total: 10,
    });
    const { container } = render(<TitleBar />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /^Downloading update 1\.1\.0/ }));
    expect(navigate).toHaveBeenCalledWith({ to: '/settings/updates' });
    expect(updateInstall).not.toHaveBeenCalled();

    act(() => emitChrome({ ...mac, fullScreen: true }));
    expect(strip(container)).toBeNull();
  });

  it('Given a ready release, Then clicking the pill asks main to install at once', async () => {
    navigate.mockClear();
    const { updateInstall } = installBridge({ kind: 'ready', version: '1.1.0' });
    render(<TitleBar />);
    await act(async () => {});
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart to update: install MangaVerse 1.1.0 now' }),
    );
    expect(updateInstall).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Given a restart under way, Then clicking the pill asks for nothing', async () => {
    navigate.mockClear();
    const { updateInstall } = installBridge({ kind: 'installing', version: '1.1.0', queued: true });
    render(<TitleBar />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /^Restart queued/ }));
    expect(updateInstall).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
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

  /** The `--title-bar-height` each platform's `:root:has(...)` rule sets, read from the sheet. */
  const cssHeights = () => {
    const heights: Record<string, number> = {};
    const rule =
      /((?::root:has\(\[data-title-bar\]\[data-platform="\w+"\]\),?\s*)+)\{\s*--title-bar-height: (\d+)px;/g;
    for (const match of css.matchAll(rule)) {
      for (const platform of match[1]!.matchAll(/data-platform="(\w+)"/g)) {
        heights[platform[1]!] = Number(match[2]);
      }
    }
    return heights;
  };

  it('Given a strip, Then each platform offsets by the height main draws its native controls at', () => {
    expect(cssHeights()).toEqual(TITLE_BAR_HEIGHTS);
    expect(TITLE_BAR_HEIGHTS).toEqual({ darwin: 28, win32: 32, linux: 32 });
    // No strip (the web build, a fullscreen window): no offset.
    expect(css).toMatch(/:root \{\s*--title-bar-height: 0px;/);
  });

  it('Given the strip, Then it drags the window, and its controls do not', () => {
    expect(block('@utility title-bar {')).toContain('app-region: drag;');
    expect(block('@utility title-bar {')).toContain('height: var(--title-bar-height);');
    expect(block('@utility app-region-no-drag {')).toContain('app-region: no-drag;');
  });

  it('Given the strip, Then it paints the sidebar chrome and not the canvas', () => {
    const titleBar = block('@utility title-bar {');
    expect(titleBar).toContain('background-color: var(--sidebar);');
    expect(titleBar).toContain('color: var(--sidebar-foreground);');
    expect(titleBar).toContain('border-block-end: 1px solid var(--sidebar-border);');
    expect(titleBar).not.toContain('var(--background)');
  });

  it('Given each platform, Then the strip keeps clear of its native controls', () => {
    const titleBar = block('@utility title-bar {');
    expect(titleBar).toMatch(/&\[data-platform="darwin"\] \{\s*padding-inline-start: 80px;/);
    expect(titleBar).toMatch(
      /&:is\(\[data-platform="win32"\], \[data-platform="linux"\]\) \{\s*padding-inline-end: calc\(/,
    );
    expect(titleBar).toContain('env(titlebar-area-width');
  });

  it('Given the strip, Then its controls keep 0.75rem from the right edge and the overlay', () => {
    const titleBar = block('@utility title-bar {');
    // macOS: the strip's own inline padding; Windows and Linux: the overlay's width plus the same.
    expect(titleBar).toContain('padding-inline: calc(var(--spacing) * 3);');
    expect(titleBar).toMatch(/var\(--spacing\) \* 3\s*\);\s*\}/);
    expect(titleBar).not.toContain('var(--spacing) * 2');
  });

  it('Given the skip link, Then it shows below the title bar, with its own padding, only on focus', () => {
    const skip = block('@utility skip-link {');
    expect(skip).toContain(
      'inset-block-start: calc(var(--title-bar-height) + var(--spacing) * 2);',
    );
    expect(skip).toContain('position: fixed;');
    expect(skip).toContain('clip-path: inset(50%);');
    const focused = skip.slice(skip.indexOf('&:focus {'));
    expect(focused).toContain('padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);');
    expect(focused).toContain('clip-path: none;');
  });

  it('Given the shell and the reader, Then both start below the strip', () => {
    expect(css).toContain(
      'padding-block-start: calc(env(safe-area-inset-top) + var(--title-bar-height));',
    );
    expect(block('@utility below-title-bar {')).toContain('top: var(--title-bar-height);');
  });
});
