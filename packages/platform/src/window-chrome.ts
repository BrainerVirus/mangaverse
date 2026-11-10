import type { WindowChromePlatform } from './types.js';

/**
 * The app-drawn title bar's height in CSS pixels, per platform. Main sizes the Windows/Linux overlay
 * and places the macOS traffic lights with it; the renderer's strip is drawn at the same height
 * (the `--title-bar-height` rules in the design system's stylesheet, pinned by a test).
 */
export const TITLE_BAR_HEIGHTS = {
  darwin: 52,
  win32: 40,
  linux: 40,
} as const satisfies Record<WindowChromePlatform, number>;

export function titleBarHeight(platform: WindowChromePlatform): number {
  return TITLE_BAR_HEIGHTS[platform];
}

/** The only colour form main hands to the native overlay: `#rrggbb`. */
export function isTitleBarColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
