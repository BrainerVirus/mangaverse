/**
 * The few values the first paint needs from the saved theme, kept in localStorage so a
 * blocking script in the document head (`public/theme-boot.js`) can paint them before the
 * first frame instead of waiting for SQLite. It is a hint, not a source of truth: `applyThemeToRoot` repaints
 * the full palette and overwrites it on every apply.
 *
 * Stored as one flat `appearance|background|foreground` string. A format that needs no
 * `JSON.parse` cannot throw on corrupt data, so only the storage access itself (blocked
 * or full storage) can fail, and that is absorbed with `.catch`. The boot script
 * duplicates the key and format as plain JS; `paint-snapshot.test.ts` pins them together.
 */
export interface ThemePaintSnapshot {
  readonly appearance: 'light' | 'dark';
  readonly background: string;
  readonly foreground: string;
}

export const THEME_PAINT_SNAPSHOT_KEY = 'mangaverse.theme.paint';

export function serializeThemePaintSnapshot(snapshot: ThemePaintSnapshot): string {
  return [snapshot.appearance, snapshot.background, snapshot.foreground].join('|');
}

/**
 * Persists the snapshot without blocking the apply and without throwing: private mode
 * and quota failures resolve silently, so the next boot just uses the default.
 */
export function writeThemePaintSnapshot(snapshot: ThemePaintSnapshot): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  return Promise.resolve()
    .then(() =>
      window.localStorage.setItem(THEME_PAINT_SNAPSHOT_KEY, serializeThemePaintSnapshot(snapshot)),
    )
    .catch(() => undefined);
}
