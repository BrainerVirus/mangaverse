/**
 * The app-drawn title bar's height in CSS pixels. Main sizes the Windows/Linux overlay and
 * centres the macOS traffic lights with it; the renderer's strip is drawn at the same height.
 */
export const TITLE_BAR_HEIGHT = 36;

/** The only colour form main hands to the native overlay: `#rrggbb`. */
export function isTitleBarColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
