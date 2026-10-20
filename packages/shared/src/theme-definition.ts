import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';

/** Version of the stored theme document. Bump when the shape changes incompatibly. */
export const THEME_DEFINITION_SCHEMA_VERSION = 1 as const;

/**
 * The user-editable core. Every other token is derived from these seeds so a theme
 * stays coherent; advanced users can still pin individual CSS variables via `overrides`.
 */
export const THEME_SEED_TOKEN_NAMES = [
  'background',
  'foreground',
  'accent',
  'primary',
  'surface',
  'border',
  'readerBackground',
  'destructive',
  'success',
  'warning',
] as const;

export type ThemeSeedTokenName = (typeof THEME_SEED_TOKEN_NAMES)[number];

export type ThemeSeeds = Readonly<Record<ThemeSeedTokenName, string>>;

/** Per-token CSS variables (`--accent`, `--ring`, …) keyed the way they are applied. */
export type ThemeOverrides = Readonly<Record<string, string>>;

export interface ThemeAppearanceDefinition {
  readonly seeds: ThemeSeeds;
  readonly overrides?: ThemeOverrides;
}

export interface ThemeDefinition {
  readonly schemaVersion: typeof THEME_DEFINITION_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  /** Built-in preset id this theme was started from, if any. */
  readonly basedOn?: string;
  readonly light: ThemeAppearanceDefinition;
  readonly dark: ThemeAppearanceDefinition;
}

export interface ThemeDefinitionIssue {
  readonly path: string;
  readonly message: string;
}

export type ThemeDefinitionValidation = AppResult<ThemeDefinition> & {
  readonly issues: readonly ThemeDefinitionIssue[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Structural validation used by the backup document, which cannot reach the culori
 * engine in `@app/theme` (that package depends on `@app/shared`, not the other way
 * round). Color syntax is validated by `@app/theme` before a definition is stored.
 */
export function validateThemeDefinitionShape(input: unknown): ThemeDefinitionValidation {
  const issues: ThemeDefinitionIssue[] = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      error: createAppError({
        code: 'theme.invalid',
        message: 'Theme definition must be an object.',
      }),
      issues: [{ path: '', message: 'Theme definition must be an object.' }],
    };
  }

  if (input['schemaVersion'] !== THEME_DEFINITION_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `Expected schemaVersion ${THEME_DEFINITION_SCHEMA_VERSION}.`,
    });
  }
  if (!isNonEmptyString(input['id'])) {
    issues.push({ path: 'id', message: 'Theme id is required.' });
  }
  if (!isNonEmptyString(input['name'])) {
    issues.push({ path: 'name', message: 'Theme name is required.' });
  }
  if (input['basedOn'] !== undefined && !isNonEmptyString(input['basedOn'])) {
    issues.push({ path: 'basedOn', message: 'basedOn must be a non-empty string.' });
  }

  for (const appearance of ['light', 'dark'] as const) {
    const value = input[appearance];
    if (!isPlainObject(value)) {
      issues.push({ path: appearance, message: `${appearance} appearance is required.` });
      continue;
    }

    const seeds = value['seeds'];
    if (!isPlainObject(seeds)) {
      issues.push({ path: `${appearance}.seeds`, message: 'seeds must be an object.' });
    } else {
      for (const name of THEME_SEED_TOKEN_NAMES) {
        if (!isNonEmptyString(seeds[name])) {
          issues.push({
            path: `${appearance}.seeds.${name}`,
            message: `Seed "${name}" must be a CSS color string.`,
          });
        }
      }
    }

    const overrides = value['overrides'];
    if (overrides !== undefined) {
      if (!isPlainObject(overrides)) {
        issues.push({ path: `${appearance}.overrides`, message: 'overrides must be an object.' });
      } else {
        for (const [token, color] of Object.entries(overrides)) {
          if (!isNonEmptyString(color)) {
            issues.push({
              path: `${appearance}.overrides.${token}`,
              message: 'Override values must be CSS color strings.',
            });
          }
        }
      }
    }
  }

  if (issues.length > 0) {
    const [first] = issues;
    return {
      ok: false,
      error: createAppError({
        code: 'theme.invalid',
        message: `${first?.path === '' ? '' : `${first?.path}: `}${first?.message ?? 'Invalid theme definition.'}`,
        details: { path: first?.path ?? '' },
      }),
      issues,
    };
  }

  return { ok: true, value: input as unknown as ThemeDefinition, issues: [] };
}

/**
 * Copies a structurally valid definition into the public shape, dropping unknown keys
 * so a round-trip cannot carry arbitrary data through the backup.
 */
export function normalizeThemeDefinitionShape(input: ThemeDefinition): ThemeDefinition {
  const appearance = (value: ThemeAppearanceDefinition): ThemeAppearanceDefinition => ({
    seeds: Object.fromEntries(
      THEME_SEED_TOKEN_NAMES.map((name) => [name, value.seeds[name]]),
    ) as unknown as ThemeSeeds,
    ...(value.overrides !== undefined
      ? {
          overrides: Object.fromEntries(
            Object.entries(value.overrides).map(([token, color]) => [token, color]),
          ),
        }
      : {}),
  });

  return {
    schemaVersion: THEME_DEFINITION_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    ...(input.basedOn !== undefined ? { basedOn: input.basedOn } : {}),
    light: appearance(input.light),
    dark: appearance(input.dark),
  };
}

export function isThemeDefinition(value: unknown): value is ThemeDefinition {
  return validateThemeDefinitionShape(value).ok;
}

/** Validates a stored/boundary value and returns its normalized copy. */
export function parseThemeDefinitionShape(input: unknown): AppResult<ThemeDefinition> {
  const result = validateThemeDefinitionShape(input);
  if (!result.ok) {
    return err(result.error);
  }
  return ok(normalizeThemeDefinitionShape(result.value));
}
