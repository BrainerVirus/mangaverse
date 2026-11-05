/**
 * The few values the first paint needs from the saved theme, kept in localStorage so a
 * blocking script in the document head can paint them before the first frame instead of
 * waiting for SQLite. It is a hint, not a source of truth: `applyThemeToRoot` repaints
 * the full palette and overwrites it on every apply.
 *
 * Stored as one flat `appearance|background|foreground` string. A format that needs no
 * `JSON.parse` cannot throw on corrupt data, so only the storage access itself (blocked
 * or full storage) can fail, and that is absorbed with `.catch`.
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

/**
 * Paints the saved snapshot: the `dark` class plus `--background` and `--foreground` on
 * the root, nothing else. Returns false and touches nothing when there is no usable
 * snapshot. It is inlined into the head script via `toString()`, so it must stay
 * self-contained: no imports, no outer identifiers, and a literal `|` matching
 * `serializeThemePaintSnapshot`.
 */
export function paintThemeSnapshot(
  key: string,
  root: HTMLElement,
  storage: Pick<Storage, 'getItem'>,
): boolean {
  const raw = storage.getItem(key);
  if (typeof raw !== 'string') {
    return false;
  }
  const parts = raw.split('|');
  const appearance = parts[0];
  const background = parts[1];
  const foreground = parts[2];
  if (
    parts.length !== 3 ||
    (appearance !== 'light' && appearance !== 'dark') ||
    !background ||
    !foreground
  ) {
    return false;
  }
  root.classList.toggle('dark', appearance === 'dark');
  root.style.setProperty('--background', background);
  root.style.setProperty('--foreground', foreground);
  return true;
}

/**
 * Classic inline script for the document head. It blocks parsing, so the saved canvas
 * lands before the first frame, which a module entry cannot guarantee because it only
 * runs after its whole import graph has loaded. The call runs as a microtask of that
 * script, so a blocked `localStorage` is absorbed by `.catch` and the page falls back
 * to the default canvas.
 */
export const THEME_PAINT_BOOT_SCRIPT = `Promise.resolve().then(function(){(${paintThemeSnapshot.toString()})(${JSON.stringify(
  THEME_PAINT_SNAPSHOT_KEY,
)},document.documentElement,localStorage)}).catch(function(){})`;
