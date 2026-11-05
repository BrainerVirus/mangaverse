import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyThemeToRoot, buildThemeCssVariables } from './apply-theme.js';
import {
  THEME_PAINT_SNAPSHOT_KEY,
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

const BOOT_SCRIPT = readFileSync(
  join(import.meta.dirname, '../../../public/theme-boot.js'),
  'utf8',
);

/** Runs the shipped head script exactly as the browser would: a classic script in global scope. */
async function runBootScript(): Promise<void> {
  new Function(BOOT_SCRIPT)();
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

interface FakeRoot {
  readonly dark: boolean[];
  readonly properties: Record<string, string>;
}

/**
 * Runs the shipped script against a fake document and storage (parameters shadow the
 * globals), so the pinned key and format are the only things it can see.
 */
async function runAgainstFakes(stored: string | null): Promise<{
  root: FakeRoot;
  keysRead: string[];
}> {
  const root: FakeRoot = { dark: [], properties: {} };
  const keysRead: string[] = [];
  const fakeDocument = {
    documentElement: {
      classList: { toggle: (_name: string, force: boolean) => root.dark.push(force) },
      style: {
        setProperty: (name: string, value: string) => {
          root.properties[name] = value;
        },
      },
    },
  };
  const fakeStorage = {
    getItem: (key: string) => {
      keysRead.push(key);
      return key === THEME_PAINT_SNAPSHOT_KEY ? stored : null;
    },
  };
  new Function('document', 'localStorage', BOOT_SCRIPT)(fakeDocument, fakeStorage);
  await Promise.resolve();
  await Promise.resolve();
  return { root, keysRead };
}

describe('public/theme-boot.js', () => {
  it('is a plain classic script: no modules, no imports', () => {
    expect(BOOT_SCRIPT).not.toMatch(/^\s*(import|export)\b/m);
  });

  it.each([sakura, amoled])(
    'reads the key and format the serializer writes ($appearance)',
    async (snapshot) => {
      const { root, keysRead } = await runAgainstFakes(serializeThemePaintSnapshot(snapshot));

      expect(keysRead).toEqual([THEME_PAINT_SNAPSHOT_KEY]);
      expect(root.dark).toEqual([snapshot.appearance === 'dark']);
      expect(root.properties).toEqual({
        '--background': snapshot.background,
        '--foreground': snapshot.foreground,
      });
    },
  );

  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['JSON-looking text', '{"appearance":"dark"}'],
    ['an unknown appearance', 'sepia|#fff|#000'],
    ['a missing field', 'dark|#000'],
    ['an empty colour', 'dark||#fff'],
    ['an extra field', 'dark|#000|#fff|#123'],
  ])('touches nothing for %s', async (_label, raw) => {
    const { root } = await runAgainstFakes(raw);

    expect(root.dark).toEqual([]);
    expect(root.properties).toEqual({});
  });

  it('paints the real document from storage before any render', async () => {
    store(serializeThemePaintSnapshot(amoled));

    await runBootScript();

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--background')).toBe('#000000');
    expect(root.style.getPropertyValue('--foreground')).toBe('#f5f5f5');
    expect(root.style.length).toBe(2);
  });

  it('removes a stale dark class for a light snapshot', async () => {
    document.documentElement.classList.add('dark');
    store(serializeThemePaintSnapshot(sakura));

    await runBootScript();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('#fff5f7');
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
