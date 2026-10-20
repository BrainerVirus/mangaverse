import type { AppResult, ThemeDefinition, ThemeDefinitionIssue, ThemeSeeds } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  THEME_DEFINITION_SCHEMA_VERSION,
  THEME_OVERRIDE_TOKENS,
  THEME_SEED_TOKEN_NAMES,
} from '@app/shared';
import { z } from 'zod';

import { isCssColor, normalizeCssColor } from './color.js';

const cssColorSchema = z
  .string()
  .refine((value) => isCssColor(value), 'Must be a CSS Color 4 value.');

const seedSchema = z.object(
  Object.fromEntries(THEME_SEED_TOKEN_NAMES.map((name) => [name, cssColorSchema])) as Record<
    (typeof THEME_SEED_TOKEN_NAMES)[number],
    typeof cssColorSchema
  >,
);

const overrideKeySchema = z.enum(THEME_OVERRIDE_TOKENS);

const appearanceSchema = z.object({
  seeds: seedSchema,
  overrides: z.partialRecord(overrideKeySchema, cssColorSchema).exactOptional(),
});

export const themeDefinitionSchema = z.object({
  schemaVersion: z.literal(THEME_DEFINITION_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  basedOn: z.string().min(1).exactOptional(),
  light: appearanceSchema,
  dark: appearanceSchema,
});

// Normal parser on purpose: the renderer CSP has no unsafe-eval, so `z.compile`
// would silently fall back and only add the compiler to the bundle. Compiled
// schemas are Node/CI-only (see docs/theme-builder-spec.md).

export type ThemeDefinitionValidation =
  | { readonly ok: true; readonly value: ThemeDefinition }
  | {
      readonly ok: false;
      readonly issues: readonly ThemeDefinitionIssue[];
      readonly error: ReturnType<typeof createAppError>;
    };

function toIssuePath(path: readonly PropertyKey[]): string {
  return path.map((segment) => String(segment)).join('.');
}

export function validateThemeDefinition(input: unknown): ThemeDefinitionValidation {
  const result = themeDefinitionSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data as ThemeDefinition };
  }

  const issues = result.error.issues.map((issue) => ({
    path: toIssuePath(issue.path),
    message: issue.message,
  }));
  const first = issues[0];
  return {
    ok: false,
    issues,
    error: createAppError({
      code: 'theme.invalid',
      message: `${first?.path === undefined || first.path === '' ? '' : `${first.path}: `}${first?.message ?? 'Invalid theme definition.'}`,
      details: { path: first?.path ?? '' },
    }),
  };
}

export function parseThemeDefinition(input: unknown): AppResult<ThemeDefinition> {
  const result = validateThemeDefinition(input);
  return result.ok ? ok(result.value) : err(result.error);
}

function normalizeSeeds(seeds: ThemeSeeds): ThemeSeeds {
  return Object.fromEntries(
    THEME_SEED_TOKEN_NAMES.map((name) => [name, normalizeCssColor(seeds[name]) ?? seeds[name]]),
  ) as unknown as ThemeSeeds;
}

/**
 * Stores every color in its normalized OKLCH form. Built-in definitions are pinned
 * literals instead, so their historical notation stays byte-identical.
 */
export function normalizeThemeDefinition(definition: ThemeDefinition): ThemeDefinition {
  const appearance = (value: ThemeDefinition['light']): ThemeDefinition['light'] => ({
    seeds: normalizeSeeds(value.seeds),
    ...(value.overrides !== undefined
      ? {
          overrides: Object.fromEntries(
            Object.entries(value.overrides).map(([token, color]) => [
              token,
              normalizeCssColor(color) ?? color,
            ]),
          ),
        }
      : {}),
  });

  return {
    schemaVersion: definition.schemaVersion,
    id: definition.id,
    name: definition.name,
    ...(definition.basedOn !== undefined ? { basedOn: definition.basedOn } : {}),
    light: appearance(definition.light),
    dark: appearance(definition.dark),
  };
}
