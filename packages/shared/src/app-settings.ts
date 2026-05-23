import type { AppResult } from './result.js';
import { createAppError, err, ok } from './result.js';

export const APP_SETTINGS_STORAGE_KEY = 'global' as const;

export interface AppSettings {
  readonly explicitContent: boolean;
  readonly showProviderErrors: boolean;
  readonly preferredLanguages: readonly string[];
  readonly lowMemoryMode: boolean;
  readonly locale: string;
}

const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

export function getDefaultAppSettings(): AppSettings {
  return {
    explicitContent: false,
    showProviderErrors: true,
    preferredLanguages: ['en'],
    lowMemoryMode: false,
    locale: 'system',
  };
}

function isNonEmptyLanguageCode(value: string): boolean {
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(value);
}

export function validateAppSettings(input: unknown): AppResult<AppSettings> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(createAppError({ code: 'app.settings.invalid', message: 'App settings must be an object.' }));
  }

  const settings = input as Record<string, unknown>;

  if (typeof settings['explicitContent'] !== 'boolean') {
    return err(createAppError({ code: 'app.settings.invalid', message: 'explicitContent must be boolean.' }));
  }

  if (typeof settings['showProviderErrors'] !== 'boolean') {
    return err(createAppError({ code: 'app.settings.invalid', message: 'showProviderErrors must be boolean.' }));
  }

  const preferredLanguages = settings['preferredLanguages'];
  if (!Array.isArray(preferredLanguages) || preferredLanguages.length === 0) {
    return err(
      createAppError({
        code: 'app.settings.invalid',
        message: 'preferredLanguages must be a non-empty array.',
      }),
    );
  }

  for (const language of preferredLanguages) {
    if (typeof language !== 'string' || !isNonEmptyLanguageCode(language)) {
      return err(
        createAppError({
          code: 'app.settings.invalid',
          message: 'Each preferred language must be a valid language code.',
        }),
      );
    }
  }

  if (typeof settings['lowMemoryMode'] !== 'boolean') {
    return err(createAppError({ code: 'app.settings.invalid', message: 'lowMemoryMode must be boolean.' }));
  }

  const locale = settings['locale'];
  if (typeof locale !== 'string' || (locale !== 'system' && !LOCALE_PATTERN.test(locale))) {
    return err(createAppError({ code: 'app.settings.invalid', message: 'locale must be system or a valid locale code.' }));
  }

  return ok({
    explicitContent: settings['explicitContent'],
    showProviderErrors: settings['showProviderErrors'],
    preferredLanguages,
    lowMemoryMode: settings['lowMemoryMode'],
    locale,
  });
}
