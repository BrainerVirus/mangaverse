import { z } from 'zod';

import type { AppSettings } from './app-settings.js';
import { validateAppSettings } from './app-settings.js';
import type { BackupValidationIssue } from './backup.js';
import type { ContentRating, MangaStatus } from './manga.js';
import type { ProviderManifest } from './provider.js';
import { validateProviderManifest } from './provider.js';
import type { ReaderSettings } from './reader-settings.js';
import { validateReaderSettings } from './reader-settings.js';
import { createAppError, ok, type AppError, type AppResult } from './result.js';
import type { ThemeDefinition } from './theme-definition.js';
import { normalizeThemeDefinitionShape, validateThemeDefinitionShape } from './theme-definition.js';

/**
 * The whole backup document is validated here so restore never receives a shape
 * the hand-written per-field checks used to cast through: `authors: null`,
 * provider mappings without a provider, or a library entry with non-boolean
 * flags all used to pass `validateBackupDocument` and then crash or corrupt the
 * delete-then-insert restore transaction.
 *
 * Normal parser on purpose: the renderer CSP has no unsafe-eval, so `z.compile`
 * would silently fall back (same ruling as `@app/theme` and the MangaDex schemas).
 */

const nonEmptyString = z
  .string()
  .refine((value) => value.trim().length > 0, { error: 'Must be a non-empty string.' });
const optionalString = nonEmptyString.exactOptional();
const optionalText = z.string().exactOptional();

const mangaTitleSchema = z.object({
  locale: optionalString,
  value: nonEmptyString,
});

const mangaPersonSchema = z.object({
  name: nonEmptyString,
  role: optionalText,
});

const mangaTagSchema = z.object({
  id: optionalString,
  label: nonEmptyString,
  namespace: optionalText,
});

const providerMappingSchema = z.object({
  id: nonEmptyString,
  providerId: nonEmptyString,
  providerMangaId: nonEmptyString,
  providerTitle: optionalText,
  providerUrl: optionalText,
  lastSyncedAt: optionalText,
});

const userTitleOverrideSchema = z.object({
  title: optionalText,
  coverImageUrl: optionalText,
  rating: z.number().exactOptional(),
  notes: optionalText,
});

const trackingLinkSchema = z.object({
  service: nonEmptyString,
  externalId: nonEmptyString,
  externalUrl: optionalText,
  lastSyncedAt: optionalText,
});

const mangaIdentitySchema = z.object({
  id: nonEmptyString,
  canonicalTitle: nonEmptyString,
  alternativeTitles: z.array(mangaTitleSchema),
  authors: z.array(mangaPersonSchema),
  artists: z.array(mangaPersonSchema),
  tags: z.array(mangaTagSchema),
  status: z.enum([
    'ongoing',
    'completed',
    'hiatus',
    'cancelled',
    'unknown',
  ] satisfies MangaStatus[]),
  contentRating: z.enum([
    'unknown',
    'safe',
    'suggestive',
    'mature',
    'explicit',
  ] satisfies ContentRating[]),
  language: optionalText,
  providerMappings: z.array(providerMappingSchema),
  defaultProviderMappingId: nonEmptyString,
  preferredChapterSourceId: optionalString,
  description: optionalText,
  coverImageUrl: optionalText,
  merged: z.boolean(),
  mergedFromIds: z.array(nonEmptyString).exactOptional(),
  userOverrides: userTitleOverrideSchema.exactOptional(),
  trackingLinks: z.array(trackingLinkSchema).exactOptional(),
  createdAt: optionalText,
  updatedAt: optionalText,
});

const libraryEntrySchema = z.object({
  id: nonEmptyString,
  mangaId: nonEmptyString,
  favorite: z.boolean(),
  categoryIds: z.array(nonEmptyString),
  status: z.enum(['reading', 'completed', 'on_hold', 'dropped', 'planned']),
  unreadCount: z.number().int().nonnegative(),
  lastReadChapterId: optionalString,
  activeProviderMappingId: optionalString,
  progressPercent: z.number().exactOptional(),
  notes: optionalText,
  addedAt: optionalText,
  updatedAt: optionalText,
});

const extensionWarningSchema = z.object({
  code: nonEmptyString,
  message: nonEmptyString,
  severity: z.enum(['info', 'warning', 'error']).exactOptional(),
});

const providerManifestSchema = z.custom<ProviderManifest>(
  // The manifest has a dedicated validator; reusing it keeps one rule set instead
  // of duplicating capability, permission and platform checks here.
  (value) => validateProviderManifest(value).ok,
  { error: 'Extension manifest failed validation.' },
);

const installedExtensionSchema = z.object({
  id: nonEmptyString,
  manifest: providerManifestSchema,
  sourceUrl: nonEmptyString,
  registryUrl: optionalText,
  checksum: optionalText,
  installedVersion: nonEmptyString,
  enabled: z.boolean(),
  installedAt: nonEmptyString,
  updatedAt: optionalText,
  state: z.enum(['pending', 'installing', 'installed', 'disabled', 'failed', 'uninstalled']),
  health: z.enum(['ok', 'degraded', 'broken', 'unknown']),
  warnings: z.array(extensionWarningSchema),
});

const providerSnapshotSchema = z.object({
  providerId: nonEmptyString,
  label: optionalText,
  settings: z.record(z.string(), z.unknown()),
});

/**
 * Reader settings and custom themes already have validators the settings UI and
 * the theme repository share; wrapping them keeps their messages, defaulting and
 * duplicate rules identical to the previous backup validator.
 */
function fromValidator<T>(
  validate: (input: unknown) => AppResult<T>,
  issuePath?: (error: AppError) => readonly (string | number)[],
) {
  return z
    .unknown()
    .default(undefined)
    .transform((value, ctx) => {
      const result = validate(value);
      if (!result.ok) {
        ctx.addIssue({
          code: 'custom',
          message: result.error.message,
          ...(issuePath !== undefined ? { path: [...issuePath(result.error)] } : {}),
        });
        return z.NEVER;
      }
      return result.value;
    });
}

const readerSettingsSchema = fromValidator<ReaderSettings>(validateReaderSettings);

/** Missing in v1 and v2 backups; when present it must satisfy the settings contract. */
const appSettingsBackupSchema = fromValidator<AppSettings>(validateAppSettings).exactOptional();

const themeSettingsSchema = z
  .object({
    themeId: optionalString,
    // Backups written before the themeId migration carry `presetId`; both map to themeId.
    presetId: optionalString,
    dark: z.boolean(),
  })
  .transform((value, ctx) => {
    const themeId = value.themeId ?? value.presetId;
    if (themeId === undefined) {
      ctx.addIssue({ code: 'custom', message: 'themeId is required.' });
      return z.NEVER;
    }
    return { themeId, dark: value.dark };
  });

function validateThemeDefinitions(input: unknown): AppResult<readonly ThemeDefinition[]> {
  if (input === undefined) {
    return ok([]);
  }
  if (!Array.isArray(input)) {
    return errorResult('Must be an array.');
  }

  const out: ThemeDefinition[] = [];
  const seen = new Set<string>();
  for (const [index, item] of input.entries()) {
    const result = validateThemeDefinitionShape(item);
    if (!result.ok) {
      const path = `themes.${index}.${result.issues[0]?.path ?? ''}`;
      return errorResult(`${path}: ${result.issues[0]?.message ?? 'Invalid theme.'}`, path);
    }
    if (seen.has(result.value.id)) {
      const path = `themes.${index}.id`;
      return errorResult(`${path}: Duplicate theme id "${result.value.id}".`, path);
    }
    seen.add(result.value.id);
    out.push(normalizeThemeDefinitionShape(result.value));
  }
  return ok(out);
}

function errorResult(message: string, path?: string): AppResult<never> {
  return {
    ok: false,
    error: createAppError({
      code: 'backup.invalid',
      message,
      ...(path !== undefined ? { details: { path } } : {}),
    }),
  };
}

const themesSchema = fromValidator<readonly ThemeDefinition[]>(
  validateThemeDefinitions,
  (error) => {
    const path = error.details?.['path'];
    if (path === undefined) return [];
    const segments = String(path).split('.');
    // `ctx.addIssue` prefixes the field path; drop the leading `themes` segment.
    return segments[0] === 'themes' ? segments.slice(1) : segments;
  },
);

export const backupDocumentSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  metadata: z.object({
    createdAt: nonEmptyString,
    appVersion: nonEmptyString,
    deviceName: optionalText,
  }),
  library: z.array(libraryEntrySchema),
  mangaIdentities: z.array(mangaIdentitySchema),
  installedExtensions: z.array(installedExtensionSchema),
  readerSettings: readerSettingsSchema,
  providerSettings: z.object({ providerSnapshots: z.array(providerSnapshotSchema) }),
  themeSettings: themeSettingsSchema,
  themes: themesSchema,
  appSettings: appSettingsBackupSchema,
});

function toIssuePath(path: readonly PropertyKey[]): string {
  return path.map((segment) => String(segment)).join('.');
}

/** Maps `issue.path` (e.g. `[mangaIdentities, 0, authors]`) into the backup issue path. */
export function toBackupValidationIssues(error: z.ZodError): readonly BackupValidationIssue[] {
  return error.issues.map((issue) => {
    const path = toIssuePath(issue.path);
    const { message } = issue;
    return {
      path,
      code: issueCode(path),
      // Validator-backed fields already carry their path in the message.
      message:
        path.length > 0 && !message.startsWith(`${path}: `) ? `${path}: ${message}` : message,
    };
  });
}

/** Reader-settings issues kept their own code from the per-section validator. */
function issueCode(path: string): string {
  return path.startsWith('readerSettings') ? 'reader.settings.invalid' : 'backup.invalid';
}
