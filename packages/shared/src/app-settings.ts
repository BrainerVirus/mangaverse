import { z } from 'zod';

import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';

export const APP_SETTINGS_STORAGE_KEY = 'global' as const;

/** Default image cache limit: 500 MiB */
export const DEFAULT_IMAGE_CACHE_LIMIT_BYTES = 524_288_000 as const;

export const MIN_IMAGE_CACHE_LIMIT_BYTES = 52_428_800 as const; // 50 MiB
export const MAX_IMAGE_CACHE_LIMIT_BYTES = 10_737_418_240 as const; // 10 GiB

const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

const preferredLanguageMessage = 'Each preferred language must be a valid language code.';
const localeMessage = 'locale must be system or a valid locale code.';
const imageCacheLimitBytesMessage =
  'imageCacheLimitBytes must be a number within the allowed cache size range.';

const appSettingsSchema = z.object(
  {
    explicitContent: z.boolean({ error: 'explicitContent must be boolean.' }),
    showProviderErrors: z.boolean({ error: 'showProviderErrors must be boolean.' }),
    preferredLanguages: z
      .array(
        z.string({ error: preferredLanguageMessage }).regex(LOCALE_PATTERN, {
          error: preferredLanguageMessage,
        }),
        { error: 'preferredLanguages must be a non-empty array.' },
      )
      .min(1, { error: 'preferredLanguages must be a non-empty array.' }),
    lowMemoryMode: z.boolean({ error: 'lowMemoryMode must be boolean.' }),
    reduceMotion: z.boolean({ error: 'reduceMotion must be boolean.' }).default(false),
    reduceTransparency: z.boolean({ error: 'reduceTransparency must be boolean.' }).default(false),
    imageCacheLimitBytes: z
      .number({ error: imageCacheLimitBytesMessage })
      .min(MIN_IMAGE_CACHE_LIMIT_BYTES, { error: imageCacheLimitBytesMessage })
      .max(MAX_IMAGE_CACHE_LIMIT_BYTES, { error: imageCacheLimitBytesMessage }),
    locale: z.union(
      [
        z.literal('system'),
        z.string({ error: localeMessage }).regex(LOCALE_PATTERN, { error: localeMessage }),
      ],
      { error: localeMessage },
    ),
  },
  { error: 'App settings must be an object.' },
);

type AppSettingsShape = z.infer<typeof appSettingsSchema>;

/** Keeps the historical public shape, where the language list is read-only. */
export type AppSettings = Readonly<
  Omit<AppSettingsShape, 'preferredLanguages'> & {
    readonly preferredLanguages: readonly string[];
  }
>;

export function getDefaultAppSettings(): AppSettings {
  return {
    explicitContent: false,
    showProviderErrors: true,
    preferredLanguages: ['en'],
    lowMemoryMode: false,
    reduceMotion: false,
    reduceTransparency: false,
    locale: 'system',
    imageCacheLimitBytes: DEFAULT_IMAGE_CACHE_LIMIT_BYTES,
  };
}

export function validateAppSettings(input: unknown): AppResult<AppSettings> {
  const result = appSettingsSchema.safeParse(input);
  if (result.success) return ok(result.data);

  return err(
    createAppError({
      code: 'app.settings.invalid',
      message: result.error.issues[0]?.message ?? 'Invalid app settings.',
    }),
  );
}
