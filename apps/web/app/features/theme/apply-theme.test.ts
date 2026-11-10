/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@app/shared';
import type { DesktopPlatformBridge } from '@app/platform';

import { applyThemeToRoot } from './apply-theme.js';

afterEach(() => {
  delete (window as { mangaversePlatform?: unknown }).mangaversePlatform;
});

describe('applyThemeToRoot on desktop', () => {
  it('Given a theme applies, Then main gets its chrome fill and ink as #rrggbb for the title bar overlay', () => {
    const windowSetTitleBarColors = vi.fn<(color: string, symbolColor: string) => Promise<unknown>>(
      async () => ok(undefined),
    );
    (window as unknown as { mangaversePlatform: unknown }).mangaversePlatform = {
      windowSetTitleBarColors,
    } as unknown as DesktopPlatformBridge;

    applyThemeToRoot(document.documentElement, { themeId: 'cyberpunk', dark: true });

    const style = document.documentElement.style;
    expect(windowSetTitleBarColors).toHaveBeenCalledTimes(1);
    const [color, symbolColor] = windowSetTitleBarColors.mock.calls[0]!;
    // The strip paints --sidebar / --sidebar-foreground (the title-bar utility), not the canvas.
    expect(color).toBe(style.getPropertyValue('--sidebar'));
    expect(symbolColor).toBe(style.getPropertyValue('--sidebar-foreground'));
    expect(color).not.toBe(style.getPropertyValue('--background'));
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(symbolColor).toMatch(/^#[0-9a-f]{6}$/);
  });
});
