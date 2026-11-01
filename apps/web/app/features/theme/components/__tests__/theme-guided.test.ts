// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ThemeDefinition, ThemeSeeds } from '@app/shared';
import { THEME_DEFINITION_SCHEMA_VERSION, THEME_SEED_TOKEN_NAMES } from '@app/shared';

import { presetToThemeDefinition } from '../../built-in-themes.js';
import { contrastRatio } from '../../color.js';
import { getThemePreset } from '../../presets.js';
import {
  BODY_TEXT_TARGET,
  GUIDED_SEED_FIELDS,
  buildContrastPairs,
  describeContrast,
  fixContrastPair,
  readGuidedOklch,
  readSurfaceWarmth,
  readTextContrast,
  setSeedChannel,
  withSurfaceWarmth,
  withTextContrast,
} from '../theme-guided.js';
// The theme package's vitest include only matches `*.test.ts`; importing the `.tsx`
// companion keeps the panel's structure tests in this run.
import './ThemeGuidedEditor.test.js';

function definition(
  patch: { light?: Partial<ThemeSeeds>; dark?: Partial<ThemeSeeds> } = {},
): ThemeDefinition {
  const preset = presetToThemeDefinition(getThemePreset('default'));
  return {
    schemaVersion: THEME_DEFINITION_SCHEMA_VERSION,
    id: 'custom-guided',
    name: 'Guided test',
    light: { seeds: { ...preset.light.seeds, ...patch.light } },
    dark: { seeds: { ...preset.dark.seeds, ...patch.dark } },
  };
}

function seedOklch(source: ThemeDefinition, appearance: 'light' | 'dark', seed: keyof ThemeSeeds) {
  const oklch = readGuidedOklch(source[appearance].seeds[seed]);
  if (oklch === undefined) {
    throw new Error(`Unparseable ${String(seed)} seed`);
  }
  return oklch;
}

function pair(source: ThemeDefinition, appearance: 'light' | 'dark', id: string) {
  const found = buildContrastPairs(source, appearance).find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`Missing ${id} pair`);
  }
  return found;
}

describe('guided seed controls', () => {
  it('lists all ten seeds with accessible copy', () => {
    expect(GUIDED_SEED_FIELDS.map((field) => field.name)).toEqual([...THEME_SEED_TOKEN_NAMES]);
    for (const field of GUIDED_SEED_FIELDS) {
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.description.length).toBeGreaterThan(0);
    }
    expect(new Set(GUIDED_SEED_FIELDS.map((field) => field.label)).size).toBe(10);
  });

  it('edits every seed through OKLCH lightness without touching the other appearance', () => {
    const original = definition();

    for (const field of GUIDED_SEED_FIELDS) {
      const next = setSeedChannel(original, 'light', field.name, { l: 0.42, c: 0 });
      expect(seedOklch(next, 'light', field.name).l).toBeCloseTo(0.42, 2);
      expect(next.light.seeds[field.name].startsWith('oklch(')).toBe(true);
      expect(next.dark.seeds).toEqual(original.dark.seeds);
    }
  });

  it('keeps the other seeds of the same appearance intact', () => {
    const original = definition();
    const next = setSeedChannel(original, 'dark', 'border', { l: 0.3 });
    for (const name of THEME_SEED_TOKEN_NAMES) {
      if (name === 'border') {
        continue;
      }
      expect(next.dark.seeds[name]).toBe(original.dark.seeds[name]);
    }
  });

  it('moves the accent hue and chroma while preserving its lightness', () => {
    const withLightness = setSeedChannel(definition(), 'light', 'accent', { l: 0.6 });
    const next = setSeedChannel(withLightness, 'light', 'accent', { c: 0.12, h: 300 });
    const accent = seedOklch(next, 'light', 'accent');
    expect(accent.l).toBeCloseTo(0.6, 2);
    expect(accent.c).toBeCloseTo(0.12, 2);
    expect(accent.h).toBeCloseTo(300, 0);
    expect(next.light.seeds.primary).toBe(withLightness.light.seeds.primary);
  });

  it('refuses to move a seed that is not a color', () => {
    const original = definition({ light: { primary: 'not-a-color' } });
    expect(setSeedChannel(original, 'light', 'primary', { l: 0.9 })).toBe(original);
  });
});

describe('guided surface warmth', () => {
  const surfaceAt = (lightness: number) =>
    definition({ light: { surface: `oklch(${lightness} 0 0)` } });

  it('reads a neutral surface as the middle of the scale', () => {
    expect(readSurfaceWarmth(surfaceAt(0.9).light.seeds)).toBe(50);
  });

  it('turns the surface warm and cool with readable hues', () => {
    const warm = withSurfaceWarmth(surfaceAt(0.9), 'light', 100);
    const warmSeed = seedOklch(warm, 'light', 'surface');
    expect(warmSeed.h).toBeCloseTo(70, 0);
    expect(warmSeed.c).toBeGreaterThan(0.01);
    expect(readSurfaceWarmth(warm.light.seeds)).toBeGreaterThanOrEqual(85);

    const cool = withSurfaceWarmth(surfaceAt(0.9), 'light', 0);
    const coolSeed = seedOklch(cool, 'light', 'surface');
    expect(coolSeed.h).toBeCloseTo(250, 0);
    expect(readSurfaceWarmth(cool.light.seeds)).toBeLessThanOrEqual(15);
  });

  it('neutralises at the middle of the scale', () => {
    const neutral = withSurfaceWarmth(surfaceAt(0.9), 'light', 50);
    expect(seedOklch(neutral, 'light', 'surface').c).toBeLessThan(0.0005);
    expect(readSurfaceWarmth(neutral.light.seeds)).toBe(50);
  });

  it('keeps a dark surface dark', () => {
    const dark = withSurfaceWarmth(surfaceAt(0.12), 'light', 100);
    expect(seedOklch(dark, 'light', 'surface').l).toBeCloseTo(0.12, 2);
  });
});

describe('guided text contrast level', () => {
  it('reads the WCAG ratio of the canvas pair', () => {
    expect(
      readTextContrast({
        ...definition().light.seeds,
        background: '#ffffff',
        foreground: '#000000',
      }),
    ).toBe(21);
    expect(readTextContrast({ ...definition().light.seeds, foreground: '#bbbbbb' })).toBeLessThan(
      BODY_TEXT_TARGET,
    );
  });

  it('raises a soft foreground until it clears the requested level', () => {
    const soft = definition({ light: { foreground: '#bbbbbb', background: '#ffffff' } });
    expect(readTextContrast(soft.light.seeds)).toBeLessThan(2);

    const next = withTextContrast(soft, 'light', 4.5);
    expect(readTextContrast(next.light.seeds)).toBeGreaterThanOrEqual(4.4);
    expect(readTextContrast(next.light.seeds)).toBeLessThan(6);
  });

  it('lowers a very strong foreground toward the requested level', () => {
    const strong = definition({ light: { foreground: '#000000', background: '#ffffff' } });
    const next = withTextContrast(strong, 'light', 4.5);
    expect(readTextContrast(next.light.seeds)).toBeGreaterThanOrEqual(4.4);
    expect(readTextContrast(next.light.seeds)).toBeLessThan(6);
  });

  it('clamps the level to the plain-language band and keeps the hue', () => {
    const tinted = definition({ light: { foreground: '#7a2020', background: '#ffffff' } });
    const next = withTextContrast(tinted, 'light', 21);
    expect(readTextContrast(next.light.seeds)).toBeGreaterThanOrEqual(7);
    const before = seedOklch(tinted, 'light', 'foreground');
    const after = seedOklch(next, 'light', 'foreground');
    expect(Math.abs(after.h - before.h)).toBeLessThan(3);
  });
});

describe('guided contrast meters', () => {
  it('reports every required pair in order', () => {
    const pairs = buildContrastPairs(definition(), 'light');
    expect(pairs.map((entry) => entry.id)).toEqual([
      'text',
      'muted',
      'primary',
      'accent',
      'sidebar',
      'destructive-glass',
      'success-glass',
      'warning-glass',
    ]);
    for (const entry of pairs) {
      expect(entry.ratio).toBe(
        Math.round((contrastRatio(entry.foreground, entry.background) ?? 0) * 100) / 100,
      );
      expect(entry.fixHint.length).toBeGreaterThan(0);
    }
  });

  it('shows a known WCAG value and a plain-language status', () => {
    const source = definition({ light: { background: '#ffffff', foreground: '#767676' } });
    const text = pair(source, 'light', 'text');
    expect(text.ratio).toBeCloseTo(contrastRatio('#767676', '#ffffff') ?? 0, 2);
    expect(text.passes).toBe(true);
    expect(text.statusLabel).toBe('Easy to read');
  });

  it('flags a low-contrast canvas pair as needing work', () => {
    const source = definition({ light: { background: '#ffffff', foreground: '#bbbbbb' } });
    const text = pair(source, 'light', 'text');
    expect(text.ratio).toBeLessThan(BODY_TEXT_TARGET);
    expect(text.passes).toBe(false);
    expect(text.status).toBe('fail');
    expect(text.statusLabel).toBe('Needs work');
  });

  it('keeps the derived foreground and glass pairs on target', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const pairs = buildContrastPairs(definition(), appearance);
      for (const entry of pairs) {
        if (entry.id === 'text') {
          continue;
        }
        expect(entry.passes).toBe(true);
      }
    }
  });

  it('protects button and sidebar text even when the seeds are faint', () => {
    const faint = definition({
      light: {
        background: '#ffffff',
        foreground: '#f7f7f7',
        surface: '#fafafa',
        accent: '#f5f5f5',
        primary: '#f7f7f7',
      },
    });
    for (const id of ['primary', 'accent', 'sidebar']) {
      expect(pair(faint, 'light', id).passes).toBe(true);
    }
  });

  it('describes every status in plain language', () => {
    expect(describeContrast(7)).toEqual({ status: 'strong', label: 'Strong contrast' });
    expect(describeContrast(4.5)).toEqual({ status: 'good', label: 'Easy to read' });
    expect(describeContrast(3)).toEqual({ status: 'large', label: 'Large text only' });
    expect(describeContrast(2.99)).toEqual({ status: 'fail', label: 'Needs work' });
  });
});

describe('guided contrast fixes', () => {
  it('fixes a failing canvas pair and explains the change', () => {
    const failing = definition({ light: { background: '#ffffff', foreground: '#cccccc' } });
    const fix = fixContrastPair(failing, 'light', 'text');

    expect(fix).toBeDefined();
    expect(fix?.definition.light.seeds.foreground).not.toBe(failing.light.seeds.foreground);
    expect(pair(fix!.definition, 'light', 'text').passes).toBe(true);
  });

  it('leaves the original draft untouched', () => {
    const failing = definition({ light: { background: '#ffffff', foreground: '#cccccc' } });
    fixContrastPair(failing, 'light', 'text');
    expect(pair(failing, 'light', 'text').passes).toBe(false);
  });

  it('offers no fix for a passing pair', () => {
    expect(fixContrastPair(definition(), 'light', 'text')).toBeUndefined();
  });

  it('fixes the dark appearance as well', () => {
    const failing = definition({ dark: { background: '#111111', foreground: '#202020' } });
    expect(pair(failing, 'dark', 'text').passes).toBe(false);
    const fix = fixContrastPair(failing, 'dark', 'text');
    expect(pair(fix!.definition, 'dark', 'text').passes).toBe(true);
  });

  it('only moves the seed the pair depends on', () => {
    const failing = definition({ light: { background: '#ffffff', foreground: '#cccccc' } });
    const fix = fixContrastPair(failing, 'light', 'text');
    expect(fix?.definition.light.seeds.background).toBe(failing.light.seeds.background);
    expect(fix?.definition.light.seeds.primary).toBe(failing.light.seeds.primary);
  });
});
