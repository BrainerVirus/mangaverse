import { describe, expect, it } from 'vitest';
import { THEME_OVERRIDE_TOKENS, type ThemeDefinition } from '@app/shared';

import { presetToThemeDefinition } from '../../built-in-themes.js';
import { buildThemeCssVariablesForDefinition } from '../../derive.js';
import { getThemePreset } from '../../presets.js';
import { validateThemeDefinition } from '../../theme-definition.js';
import {
  exportThemeCss,
  exportThemeJson,
  FIXED_THEME_TOKENS,
  findOutOfGamutThemeColors,
  getThemeTokenValue,
  setThemeOverride,
  THEME_TOKEN_GROUPS,
  toHexColor,
  validateThemeJsonText,
} from '../theme-advanced.js';

function customDefinition(): ThemeDefinition {
  return {
    ...presetToThemeDefinition(getThemePreset('default')),
    id: 'custom:demo',
    name: 'Custom Demo',
    basedOn: 'default',
  };
}

function diagnosticsFor(text: string) {
  const result = validateThemeJsonText(text);
  expect(result.ok).toBe(false);
  return result.diagnostics;
}

describe('advanced token groups', () => {
  it('Given the allow-list, Then every token appears once across the five groups', () => {
    expect(THEME_TOKEN_GROUPS.map((group) => group.label)).toEqual([
      'Surfaces',
      'Text',
      'Borders',
      'Status',
      'Reader',
    ]);
    const tokens = THEME_TOKEN_GROUPS.flatMap((group) => group.tokens);
    expect(tokens).toHaveLength(THEME_OVERRIDE_TOKENS.length);
    expect(new Set(tokens)).toEqual(new Set(THEME_OVERRIDE_TOKENS));
  });

  it('Given glass and radius tokens, Then they are fixed and never overridable', () => {
    expect(FIXED_THEME_TOKENS).toEqual([
      '--glass-thin',
      '--glass-regular',
      '--glass-thick',
      '--glass-stage',
      '--glass-sheen',
      '--glass-inner',
      '--radius-box',
      '--radius-control',
      '--radius-btn',
      '--radius-badge',
      '--radius-glass',
    ]);
    for (const token of FIXED_THEME_TOKENS) {
      expect(THEME_OVERRIDE_TOKENS).not.toContain(token);
    }
  });

  it('Given an allow-listed token, When overridden, Then the draft updates without mutation', () => {
    const definition = customDefinition();
    const next = setThemeOverride(definition, 'light', '--ring', 'oklch(0.62 0.18 70)');

    expect(next.light.overrides?.['--ring']).toBe('oklch(0.62 0.18 70)');
    expect(definition.light.overrides?.['--ring']).not.toBe('oklch(0.62 0.18 70)');
    expect(getThemeTokenValue(next, 'light', '--ring')).toBe('oklch(0.62 0.18 70)');
    expect(getThemeTokenValue(next, 'dark', '--ring')).not.toBe('oklch(0.62 0.18 70)');
  });

  it('Given an override, When cleared, Then the derived color returns', () => {
    const definition = customDefinition();
    const next = setThemeOverride(
      setThemeOverride(definition, 'dark', '--ring', '#123456'),
      'dark',
      '--ring',
      '   ',
    );

    expect(next.dark.overrides).toEqual(definition.dark.overrides);
    expect(getThemeTokenValue(next, 'dark', '--ring')).toBe(
      buildThemeCssVariablesForDefinition(definition, 'dark')['--ring'],
    );
  });

  it('Given a token outside the allow-list, Then the update is rejected with its name', () => {
    expect(() => setThemeOverride(customDefinition(), 'light', '--glass-stage', '#fff')).toThrow(
      'Unknown theme override token "--glass-stage".',
    );
  });
});

describe('gamut warnings', () => {
  it('Given a Display P3 seed, Then the warning keeps the authored draft valid', () => {
    const definition = customDefinition();
    const p3: ThemeDefinition = {
      ...definition,
      light: {
        ...definition.light,
        seeds: { ...definition.light.seeds, background: 'color(display-p3 1 0 0)' },
      },
    };

    const entries = findOutOfGamutThemeColors(p3);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe('light.seeds.background');
    expect(entries[0]?.value).toBe('color(display-p3 1 0 0)');
    expect(entries[0]?.srgbFallback).toMatch(/^oklch\(/);
    // The warning never blocks the draft: the authored value is still a valid theme.
    expect(validateThemeDefinition(p3).ok).toBe(true);
  });

  it('Given an out-of-sRGB override, Then the entry names the exact override path', () => {
    const next = setThemeOverride(
      customDefinition(),
      'dark',
      '--success',
      'color(display-p3 0 1 0)',
    );
    expect(findOutOfGamutThemeColors(next).map((entry) => entry.path)).toEqual([
      'dark.overrides.--success',
    ]);
  });

  it('Given in-sRGB colors, Then no warning is reported', () => {
    expect(findOutOfGamutThemeColors(customDefinition())).toEqual([]);
  });

  it('Given a color and its sRGB fallback, Then each maps to a hex preview', () => {
    expect(toHexColor('color(display-p3 1 0 0)')).toBe('#ff0000');
    expect(toHexColor('not-a-color')).toBeUndefined();
  });
});

describe('theme JSON diagnostics', () => {
  it('Given broken JSON, Then the syntax error is reported at line and column', () => {
    const diagnostics = diagnosticsFor('{\n  "schemaVersion": 1,\n  "name": "x",\n  "id":\n}');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.line).toBe(5);
    expect(diagnostics[0]?.column).toBe(1);
    expect(diagnostics[0]?.message).toContain('JSON syntax error at line 5, column 1');
    expect(diagnostics[0]?.message).toContain('Accepted: a JSON object');
  });

  it('Given an invalid override color, Then the diagnostic marks the exact value', () => {
    const definition = customDefinition();
    const text = exportThemeJson({
      ...definition,
      light: { ...definition.light, overrides: { '--ring': 'nope' } },
    });

    const [diagnostic] = diagnosticsFor(text);
    expect(diagnostic?.path).toBe('light.overrides.--ring');
    expect(text.slice(diagnostic?.from, diagnostic?.to)).toBe('"nope"');
    expect(diagnostic?.message).toContain('light.overrides.--ring: Must be a CSS Color 4 value');
    expect(diagnostic?.message).toContain('Accepted: any CSS Color 4 value');
  });

  it('Given an unknown override token, Then the diagnostic marks the key and explains the allow-list', () => {
    const text = exportThemeJson(customDefinition()).replace(
      '"overrides": {',
      '"overrides": {\n      "--glass-stage": "#fff",',
    );

    const [diagnostic] = diagnosticsFor(text);
    expect(diagnostic?.path).toBe('light.overrides.--glass-stage');
    expect(text.slice(diagnostic?.from, diagnostic?.to)).toBe('"--glass-stage"');
    expect(diagnostic?.message).toContain('Unrecognized key: --glass-stage');
    expect(diagnostic?.message).toContain(
      'glass tier, sheen, inner shadow and radius tokens are read-only',
    );
  });

  it('Given an unknown top-level or seed key, Then its exact path is reported', () => {
    const withTopLevel = diagnosticsFor(
      exportThemeJson(customDefinition()).replace('{\n', '{\n  "extra": true,\n'),
    );
    expect(withTopLevel.map((diagnostic) => diagnostic.path)).toContain('extra');

    const withSeed = diagnosticsFor(
      exportThemeJson(customDefinition()).replace(
        '"seeds": {',
        '"seeds": {\n      "extraSeed": "#fff",',
      ),
    );
    expect(withSeed.map((diagnostic) => diagnostic.path)).toContain('light.seeds.extraSeed');
    expect(withSeed[0]?.message).toContain('Accepted: the ten seed names');
  });
});

describe('JSON import and export', () => {
  it('Given an exported theme, Then importing it round-trips', () => {
    const definition = customDefinition();
    const result = validateThemeJsonText(exportThemeJson(definition));
    expect(result).toMatchObject({ ok: true, value: definition });
  });

  it('Given a built-in id, Then the import is rejected with the id path', () => {
    const text = exportThemeJson(customDefinition()).replace(
      '"id": "custom:demo"',
      '"id": "default"',
    );
    const [diagnostic] = diagnosticsFor(text);
    expect(diagnostic?.path).toBe('id');
    expect(diagnostic?.message).toContain('Built-in theme id "default" cannot be imported');
  });

  it('Given a non-custom id, Then the import is rejected with the id path', () => {
    const text = exportThemeJson(customDefinition()).replace(
      '"id": "custom:demo"',
      '"id": "my-theme"',
    );
    const [diagnostic] = diagnosticsFor(text);
    expect(diagnostic?.path).toBe('id');
    expect(diagnostic?.message).toContain('must use a custom:<id> id');
  });

  it('Given a valid theme, Then CSS export emits only resolved variables', () => {
    const definition = customDefinition();
    const css = exportThemeCss(definition);
    const declarations = css.split('\n').filter((line) => line.startsWith('  --'));

    expect(css).toContain(':root {');
    expect(css).toContain('.dark {');
    expect(declarations).toHaveLength(THEME_OVERRIDE_TOKENS.length * 2);
    for (const declaration of declarations) {
      expect(declaration).toMatch(/^ {2}--[\w-]+: .+;$/);
    }
    expect(css).not.toContain('schemaVersion');
    expect(css).not.toContain('seeds');
    expect(css).toContain(
      `  --background: ${buildThemeCssVariablesForDefinition(definition, 'light')['--background']};`,
    );
  });

  it('Given an invalid definition, Then CSS export refuses instead of injecting CSS', () => {
    const definition = customDefinition();
    const invalid = {
      ...definition,
      light: { ...definition.light, overrides: { '--ring': 'red; } body { display: none' } },
    } as ThemeDefinition;
    expect(() => exportThemeCss(invalid)).toThrow('Cannot export an invalid theme');
  });
});
