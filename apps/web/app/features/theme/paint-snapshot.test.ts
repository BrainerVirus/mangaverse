import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyThemeToRoot, buildThemeCssVariables } from './apply-theme.js';
import {
  THEME_PAINT_BOOT_SCRIPT,
  THEME_PAINT_SNAPSHOT_KEY,
  paintThemeSnapshot,
  serializeThemePaintSnapshot,
  writeThemePaintSnapshot,
} from './paint-snapshot.js';
import { resolveThemeAppearance } from './resolve-theme.js';

const sakura = { appearance: 'light', background: '#fff5f7', foreground: '#3b1f2b' } as const;
const amoled = { appearance: 'dark', background: '#000000', foreground: '#f5f5f5' } as const;

function store(raw: string): void {
  window.localStorage.setItem(THEME_PAINT_SNAPSHOT_KEY, raw);
}

function stored(): string | null {
  return window.localStorage.getItem(THEME_PAINT_SNAPSHOT_KEY);
}

/** Runs the head script exactly as the browser would: a classic script in global scope. */
async function runBootScript(): Promise<void> {
  new Function(THEME_PAINT_BOOT_SCRIPT)();
  await Promise.resolve();
  await Promise.resolve();
}

/** `applyThemeToRoot` persists on a microtask; wait for it before reading storage. */
async function flushSnapshotWrite(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('writeThemePaintSnapshot', () => {
  it('stores one flat namespaced string', async () => {
    await writeThemePaintSnapshot(sakura);

    expect(stored()).toBe('light|#fff5f7|#3b1f2b');
  });

  it('does not reject when the write is refused', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    await expect(writeThemePaintSnapshot(sakura)).resolves.toBeUndefined();
  });
});

describe('paintThemeSnapshot', () => {
  let root: HTMLElement;
  const storage = { getItem: (key: string) => window.localStorage.getItem(key) };

  beforeEach(() => {
    root = document.createElement('html');
  });

  it('sets the dark class and only the two custom properties', () => {
    store(serializeThemePaintSnapshot(amoled));

    expect(paintThemeSnapshot(THEME_PAINT_SNAPSHOT_KEY, root, storage)).toBe(true);

    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--background')).toBe('#000000');
    expect(root.style.getPropertyValue('--foreground')).toBe('#f5f5f5');
    expect(root.style.length).toBe(2);
  });

  it('removes a stale dark class for a light snapshot', () => {
    root.classList.add('dark');
    store(serializeThemePaintSnapshot(sakura));

    paintThemeSnapshot(THEME_PAINT_SNAPSHOT_KEY, root, storage);

    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.getPropertyValue('--background')).toBe('#fff5f7');
  });

  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['JSON-looking text', '{"appearance":"dark"}'],
    ['an unknown appearance', 'sepia|#fff|#000'],
    ['a missing field', 'dark|#000'],
    ['an empty colour', 'dark||#fff'],
    ['an extra field', 'dark|#000|#fff|#123'],
  ])('leaves the root untouched for %s', (_label, raw) => {
    if (raw !== null) {
      store(raw);
    }

    expect(paintThemeSnapshot(THEME_PAINT_SNAPSHOT_KEY, root, storage)).toBe(false);

    expect(root.className).toBe('');
    expect(root.getAttribute('style')).toBeNull();
  });
});

describe('THEME_PAINT_BOOT_SCRIPT', () => {
  it('paints the saved canvas from a global-scope classic script before any render', async () => {
    store(serializeThemePaintSnapshot(amoled));

    await runBootScript();

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--background')).toBe('#000000');
    expect(root.style.getPropertyValue('--foreground')).toBe('#f5f5f5');
  });

  it('does nothing on first run or a malformed snapshot', async () => {
    await runBootScript();
    store('not|a snapshot|at all|really');
    await runBootScript();

    expect(document.documentElement.className).toBe('');
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });

  it('does not throw or reject when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const unhandled = vi.fn<() => void>();
    process.on('unhandledRejection', unhandled);

    await runBootScript();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(document.documentElement.className).toBe('');
  });
});

describe('applyThemeToRoot snapshot', () => {
  it.each([
    { themeId: 'sakura', dark: false },
    { themeId: 'amoled-black', dark: true },
    { themeId: 'cyberpunk', dark: true },
  ])('persists the first-paint values for $themeId', async (settings) => {
    const root = document.createElement('html');

    applyThemeToRoot(root, settings);
    await flushSnapshotWrite();

    const variables = buildThemeCssVariables(settings);
    expect(stored()).toBe(
      serializeThemePaintSnapshot({
        appearance: resolveThemeAppearance(settings),
        background: variables['--background'],
        foreground: variables['--foreground'],
      }),
    );
  });

  it('overwrites the boot values with the full theme and no residue', async () => {
    store(serializeThemePaintSnapshot(sakura));
    await runBootScript();
    const root = document.documentElement;

    applyThemeToRoot(root, { themeId: 'amoled-black', dark: true });

    const variables = buildThemeCssVariables({ themeId: 'amoled-black', dark: true });
    expect(root.style.getPropertyValue('--background')).toBe(variables['--background']);
    expect(root.style.getPropertyValue('--foreground')).toBe(variables['--foreground']);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('light')).toBe(false);
  });

  it('replaces the snapshot when the theme resets to default', async () => {
    const root = document.createElement('html');
    applyThemeToRoot(root, { themeId: 'sakura', dark: false });
    applyThemeToRoot(root, { themeId: 'default', dark: false });
    await flushSnapshotWrite();

    const variables = buildThemeCssVariables({ themeId: 'default', dark: false });
    expect(stored()?.split('|')[1]).toBe(variables['--background']);
  });
});
