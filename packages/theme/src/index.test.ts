import { describe, expect, it } from 'vitest';
import { getThemeSettings, upsertThemeSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';

import {
  applyThemeToRoot,
  buildThemeCssVariables,
  createCustomThemeId,
  deleteThemeDefinition,
  fetchThemeDefinition,
  fetchThemeDefinitions,
  fetchThemeSettings,
  getDefaultThemeSettings,
  getThemePreset,
  isThemePresetId,
  saveThemeDefinition,
  saveThemeSettings,
  ThemeCustomizationPage,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  toThemePreviewDefinition,
  resolveEffectiveDark,
  resolveThemeAppearance,
  validateThemeSettings,
} from './index.js';
import { presetToThemeDefinition } from './built-in-themes.js';

function customTheme(id = createCustomThemeId('test')) {
  const base = presetToThemeDefinition(getThemePreset('sakura'));
  return {
    ...base,
    id,
    name: 'Custom Sakura',
    basedOn: 'sakura',
    light: {
      ...base.light,
      seeds: { ...base.light.seeds, background: 'rgb(255 250 252)' },
    },
  };
}

describe('@app/theme exports', () => {
  it('exports the theme feature surface', () => {
    expect(fetchThemeSettings).toBeTypeOf('function');
    expect(saveThemeSettings).toBeTypeOf('function');
    expect(ThemeCustomizationPage).toBeTypeOf('function');
    expect(THEME_PRESETS.length).toBeGreaterThan(0);
    expect(getDefaultThemeSettings()).toEqual({ themeId: 'default', dark: false });
    expect(validateThemeSettings({ themeId: 'default', dark: false }).ok).toBe(true);
  });
});

describe('theme presets', () => {
  it('includes the required design presets', () => {
    expect(THEME_PRESET_IDS).toEqual([
      'default',
      'minimal-light',
      'minimal-dark',
      'vercel-monochrome',
      'sakura',
      'cyberpunk',
      'amoled-black',
      'warm-paper',
      'high-contrast',
      'system',
    ]);
  });

  it('falls back to default for unknown ids', () => {
    expect(getThemePreset('unknown').id).toBe('default');
  });
});

describe('resolveEffectiveDark', () => {
  it('respects explicit dark flag for default preset', () => {
    expect(resolveEffectiveDark({ themeId: 'default', dark: true })).toBe(true);
    expect(resolveEffectiveDark({ themeId: 'default', dark: false })).toBe(false);
  });

  it('locks appearance for fixed presets', () => {
    expect(resolveEffectiveDark({ themeId: 'minimal-light', dark: true })).toBe(false);
    expect(resolveEffectiveDark({ themeId: 'minimal-dark', dark: false })).toBe(true);
    expect(resolveEffectiveDark({ themeId: 'amoled-black', dark: false })).toBe(true);
  });

  it('lets custom themes keep both appearances', () => {
    const id = createCustomThemeId('appearance');
    expect(resolveEffectiveDark({ themeId: id, dark: true })).toBe(true);
    expect(resolveEffectiveDark({ themeId: id, dark: false })).toBe(false);
  });
});

describe('validateThemeSettings', () => {
  it('accepts known presets', () => {
    const result = validateThemeSettings({ themeId: 'sakura', dark: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected result.ok to be true');
    }
    expect(result.value).toEqual({ themeId: 'sakura', dark: true });
  });

  it('maps a legacy presetId to themeId', () => {
    const result = validateThemeSettings({ presetId: 'sakura', dark: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected result.ok to be true');
    }
    expect(result.value).toEqual({ themeId: 'sakura', dark: true });
  });

  it('accepts custom theme ids', () => {
    const result = validateThemeSettings({ themeId: createCustomThemeId('abc'), dark: false });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown presets', () => {
    const result = validateThemeSettings({ themeId: 'neon', dark: false });
    expect(result.ok).toBe(false);
  });
});

describe('applyThemeToRoot', () => {
  it('applies css variables and appearance class', () => {
    const classNames = new Set<string>();
    const cssVars = new Map<string, string>();
    const root = {
      classList: {
        values: classNames,
        remove: (...tokens: string[]) => {
          for (const token of tokens) classNames.delete(token);
        },
        add: (...tokens: string[]) => {
          for (const token of tokens) classNames.add(token);
        },
        contains: (token: string) => classNames.has(token),
      },
      style: {
        values: cssVars,
        setProperty: (key: string, value: string) => {
          cssVars.set(key, value);
        },
        getPropertyValue: (key: string) => cssVars.get(key) ?? '',
        removeProperty: (key: string) => {
          cssVars.delete(key);
        },
      },
    } as unknown as HTMLElement;

    applyThemeToRoot(root, { themeId: 'cyberpunk', dark: true });

    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--background')).toBe('#0a0614');
    expect(root.style.getPropertyValue('--reader-background')).toBe('#050310');
    expect(root.style.getPropertyValue('--destructive-glass')).toBe('#fb7185');
    expect(root.style.getPropertyValue('--success-glass')).toBe('#34d399');
    expect(root.style.getPropertyValue('--warning-glass')).toBe('#fbbf24');
  });
});

describe('toThemePreviewDefinition', () => {
  it('maps preset tokens into preview cards', () => {
    const preview = toThemePreviewDefinition({ themeId: 'warm-paper', dark: false });
    expect(preview.name).toBe('Warm Paper');
    expect(preview.background).toBe('#f5ead6');
    expect(preview.readerBackground).toBe('#f0e4cc');
  });
});

describe('fetchThemeSettings', () => {
  it('returns defaults when nothing is stored', async () => {
    const { db } = await createSqlJsHarness();
    const page = await fetchThemeSettings(db);
    expect(page.settings).toEqual(getDefaultThemeSettings());
  });

  it('loads persisted settings', async () => {
    const { db } = await createSqlJsHarness();
    await upsertThemeSettings(db, { themeId: 'sakura', dark: true });
    const page = await fetchThemeSettings(db);
    expect(page.settings).toEqual({ themeId: 'sakura', dark: true });
  });

  it('loads a custom definition for a custom themeId', async () => {
    const { db } = await createSqlJsHarness();
    const definition = customTheme();
    expect((await saveThemeDefinition(db, definition)).ok).toBe(true);
    await saveThemeSettings(db, { themeId: definition.id, dark: true });

    const page = await fetchThemeSettings(db);
    expect(page.theme?.id).toBe(definition.id);
  });
});

describe('saveThemeSettings', () => {
  it('persists validated settings', async () => {
    const { db } = await createSqlJsHarness();
    const result = await saveThemeSettings(db, { themeId: 'high-contrast', dark: false });
    expect(result.ok).toBe(true);
    expect(await getThemeSettings(db)).toEqual({ themeId: 'high-contrast', dark: false });
  });

  it('rejects invalid settings', async () => {
    const { db } = await createSqlJsHarness();
    const result = await saveThemeSettings(db, { themeId: 'invalid', dark: false });
    expect(result.ok).toBe(false);
  });
});

describe('custom theme storage', () => {
  it('round-trips a validated definition', async () => {
    const { db } = await createSqlJsHarness();
    const definition = customTheme();
    const saved = await saveThemeDefinition(db, definition);
    expect(saved.ok).toBe(true);

    const stored = await fetchThemeDefinition(db, definition.id);
    expect(stored?.light.seeds.background).toMatch(/^oklch\(/);
    expect((await fetchThemeDefinitions(db)).map((theme) => theme.id)).toEqual([definition.id]);
  });

  it('rejects invalid definitions and built-in ids', async () => {
    const { db } = await createSqlJsHarness();
    const invalid = await saveThemeDefinition(db, { id: 'custom:broken' });
    expect(invalid.ok).toBe(false);

    const builtIn = await saveThemeDefinition(db, customTheme('sakura'));
    expect(builtIn.ok).toBe(false);
  });

  it('deletes custom themes but never built-ins', async () => {
    const { db } = await createSqlJsHarness();
    const definition = customTheme();
    await saveThemeDefinition(db, definition);

    expect((await deleteThemeDefinition(db, 'sakura')).ok).toBe(false);
    expect((await deleteThemeDefinition(db, definition.id)).ok).toBe(true);
    expect(await fetchThemeDefinition(db, definition.id)).toBeUndefined();
  });
});

describe('buildThemeCssVariables', () => {
  it('includes semantic roles used by the design system', () => {
    const css = buildThemeCssVariables({ themeId: 'default', dark: false });
    expect(css['--background']).toBeTruthy();
    expect(css['--reader-background']).toBeTruthy();
    expect(resolveThemeAppearance({ themeId: 'default', dark: false })).toBe('light');
    expect(isThemePresetId('system')).toBe(true);
  });

  it('applies a custom definition when one is supplied', () => {
    const definition = customTheme();
    const css = buildThemeCssVariables({ themeId: definition.id, dark: false }, definition);
    expect(css['--background']).toBe('rgb(255 250 252)');
  });
});
