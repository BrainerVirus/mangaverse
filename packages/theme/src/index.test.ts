import { describe, expect, it } from 'vitest';
import { getThemeSettings, upsertThemeSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';

import {
  applyThemeToRoot,
  buildThemeCssVariables,
  fetchThemeSettings,
  getDefaultThemeSettings,
  saveThemeSettings,
  ThemeCustomizationPage,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  toThemePreviewDefinition,
  getThemePreset,
  isThemePresetId,
  resolveEffectiveDark,
  resolveThemeAppearance,
  validateThemeSettings,
} from './index.js';

describe('@app/theme exports', () => {
  it('exports the theme feature surface', () => {
    expect(fetchThemeSettings).toBeTypeOf('function');
    expect(saveThemeSettings).toBeTypeOf('function');
    expect(ThemeCustomizationPage).toBeTypeOf('function');
    expect(THEME_PRESETS.length).toBeGreaterThan(0);
    expect(getDefaultThemeSettings()).toEqual({ presetId: 'default', dark: false });
    expect(validateThemeSettings({ presetId: 'default', dark: false }).ok).toBe(true);
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
    expect(resolveEffectiveDark({ presetId: 'default', dark: true })).toBe(true);
    expect(resolveEffectiveDark({ presetId: 'default', dark: false })).toBe(false);
  });

  it('locks appearance for fixed presets', () => {
    expect(resolveEffectiveDark({ presetId: 'minimal-light', dark: true })).toBe(false);
    expect(resolveEffectiveDark({ presetId: 'minimal-dark', dark: false })).toBe(true);
    expect(resolveEffectiveDark({ presetId: 'amoled-black', dark: false })).toBe(true);
  });
});

describe('validateThemeSettings', () => {
  it('accepts known presets', () => {
    const result = validateThemeSettings({ presetId: 'sakura', dark: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ presetId: 'sakura', dark: true });
    }
  });

  it('rejects unknown presets', () => {
    const result = validateThemeSettings({ presetId: 'neon', dark: false });
    expect(result.ok).toBe(false);
  });
});

describe('applyThemeToRoot', () => {
  it('applies css variables and appearance class', () => {
    const root = {
      classList: {
        values: new Set<string>(),
        remove: (...tokens: string[]) => {
          for (const token of tokens) root.classList.values.delete(token);
        },
        add: (...tokens: string[]) => {
          for (const token of tokens) root.classList.values.add(token);
        },
        contains: (token: string) => root.classList.values.has(token),
      },
      style: {
        values: new Map<string, string>(),
        setProperty: (key: string, value: string) => {
          root.style.values.set(key, value);
        },
        getPropertyValue: (key: string) => root.style.values.get(key) ?? '',
        removeProperty: (key: string) => {
          root.style.values.delete(key);
        },
      },
    } as unknown as HTMLElement;

    applyThemeToRoot(root, { presetId: 'cyberpunk', dark: true });

    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--background')).toBe('#0a0614');
    expect(root.style.getPropertyValue('--reader-background')).toBe('#050310');
  });
});

describe('toThemePreviewDefinition', () => {
  it('maps preset tokens into preview cards', () => {
    const preview = toThemePreviewDefinition({ presetId: 'warm-paper', dark: false });
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
    await upsertThemeSettings(db, { presetId: 'sakura', dark: true });
    const page = await fetchThemeSettings(db);
    expect(page.settings).toEqual({ presetId: 'sakura', dark: true });
  });
});

describe('saveThemeSettings', () => {
  it('persists validated settings', async () => {
    const { db } = await createSqlJsHarness();
    const result = await saveThemeSettings(db, { presetId: 'high-contrast', dark: false });
    expect(result.ok).toBe(true);
    expect(await getThemeSettings(db)).toEqual({ presetId: 'high-contrast', dark: false });
  });

  it('rejects invalid settings', async () => {
    const { db } = await createSqlJsHarness();
    const result = await saveThemeSettings(db, { presetId: 'invalid', dark: false });
    expect(result.ok).toBe(false);
  });
});

describe('buildThemeCssVariables', () => {
  it('includes semantic roles used by the design system', () => {
    const css = buildThemeCssVariables({ presetId: 'default', dark: false });
    expect(css['--background']).toBeTruthy();
    expect(css['--reader-background']).toBeTruthy();
    expect(resolveThemeAppearance({ presetId: 'default', dark: false })).toBe('light');
    expect(isThemePresetId('system')).toBe(true);
  });
});
