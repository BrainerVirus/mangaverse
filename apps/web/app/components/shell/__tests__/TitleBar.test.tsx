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
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const view = render(
    <TitleBarView
      chrome={chrome}
      update={update}
      open={false}
      onOpenChange={onOpenChange}
      onLater={() => {}}
      onInstall={() => {}}
      onOpenSettings={() => {}}
    />,
  );
  return { onOpenChange, container: view.container };
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
      'Downloading update 1.1.0, 40%',
      'download',
      'neutral',
    ],
    [
      'ready',
      withPhase({ kind: 'ready', version: '1.1.0' }),
      'Restart to update',
      'Restart to update: 1.1.0 is ready to install',
      'rotate-cw',
      'attention',
    ],
    [
      'queued',
      withPhase({ kind: 'installing', version: '1.1.0', queued: true }),
      'Restart queued',
      'Restart queued: Restart queued for 1.1.0',
      'clock',
      'neutral',
    ],
    [
      'restarting',
      withPhase({ kind: 'installing', version: '1.1.0', queued: false }),
      'Restarting…',
      'Restarting…: Restarting to install 1.1.0',
      'rotate-cw',
      'neutral',
    ],
  ])(
    'Given an update %s, Then a named pill with its icon and label opens the update popover',
    (_phase, update, label, name, icon, tone) => {
      const { onOpenChange } = renderView(mac, update);
      const button = screen.getByRole('button', { name });
      expect(button.textContent).toBe(label);
      expect(button.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
      expect(button.dataset.tone).toBe(tone);
      // The button opts out of the drag region, or the click would move the window instead.
      expect(button.closest('.app-region-no-drag')).not.toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange.mock.calls[0]![0]).toBe(true);
    },
  );

  it('Given a restart is waiting, Then the pill is the filled primary call to action', () => {
    renderView(mac, withPhase({ kind: 'ready', version: '1.1.0' }));
    const button = screen.getByRole('button');
    expect(button.classList.contains('bg-primary')).toBe(true);
    expect(button.classList.contains('text-primary-foreground')).toBe(true);
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
      expect(arc.getAttribute('class')).toContain('progress-ring-arc');
      expect(arc.getAttribute('class')).toContain('motion-reduce:transition-none');
    },
  );

  it('Given a restart in progress, Then the spinner stops for reduced motion', () => {
    renderView(mac, withPhase({ kind: 'installing', version: '1.1.0', queued: false }));
    const icon = screen.getByRole('button').querySelector('svg.lucide-rotate-cw')!;
    expect(icon.getAttribute('class')).toContain('animate-spin');
    expect(icon.getAttribute('class')).toContain('motion-reduce:animate-none');
  });
});

describe('TitleBar', () => {
  it('Given the desktop bridge, Then it draws from main, opens the popover from the pill and hides on fullscreen', async () => {
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
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Restart to update: 1\.1\.0/ }));
    expect(screen.getByRole('dialog', { name: 'MangaVerse 1.1.0 is ready' })).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    // The panel's footer link goes to the settings page and closes the panel.
    fireEvent.click(screen.getByRole('button', { name: 'Update settings' }));
    expect(navigate).toHaveBeenCalledWith({ to: '/settings/updates' });
    expect(screen.queryByRole('dialog')).toBeNull();

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

  it('Given the ring arc, Then it eases between percents and snaps for reduced motion', () => {
    expect(block('@utility progress-ring-arc {')).toContain(
      'transition: stroke-dashoffset 300ms ease-out;',
    );
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

  it('Given the shell and the reader, Then both start below the strip', () => {
    expect(css).toContain(
      'padding-block-start: calc(env(safe-area-inset-top) + var(--title-bar-height));',
    );
    expect(block('@utility below-title-bar {')).toContain('top: var(--title-bar-height);');
  });
});
