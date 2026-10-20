import { describe, expect, it } from 'vitest';

import {
  getDefaultAppSettings,
  MAX_IMAGE_CACHE_LIMIT_BYTES,
  MIN_IMAGE_CACHE_LIMIT_BYTES,
  validateAppSettings,
} from './app-settings.js';

describe('app settings', () => {
  it('returns stable defaults', () => {
    expect(getDefaultAppSettings()).toEqual({
      explicitContent: false,
      showProviderErrors: true,
      preferredLanguages: ['en'],
      lowMemoryMode: false,
      reduceMotion: false,
      reduceTransparency: false,
      locale: 'system',
      imageCacheLimitBytes: 524_288_000,
    });
  });

  it('validates a complete settings object', () => {
    const result = validateAppSettings({
      explicitContent: true,
      showProviderErrors: false,
      preferredLanguages: ['en', 'ja'],
      lowMemoryMode: true,
      reduceMotion: true,
      reduceTransparency: true,
      locale: 'pt-BR',
      imageCacheLimitBytes: 524_288_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected result.ok to be true');
    }
    expect(result.value.preferredLanguages).toEqual(['en', 'ja']);
  });

  it('defaults appearance fields when loading settings saved before they existed', () => {
    const legacySettings = {
      explicitContent: false,
      showProviderErrors: true,
      preferredLanguages: ['en'],
      lowMemoryMode: false,
      locale: 'system',
      imageCacheLimitBytes: 524_288_000,
    };

    const result = validateAppSettings(legacySettings);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected legacy settings to remain valid');
    }
    expect(result.value.reduceMotion).toBe(false);
    expect(result.value.reduceTransparency).toBe(false);
  });

  it.each(['reduceMotion', 'reduceTransparency'] as const)(
    'rejects a non-boolean %s value',
    (field) => {
      const result = validateAppSettings({ ...getDefaultAppSettings(), [field]: 'yes' });

      expect(result.ok).toBe(false);
    },
  );

  it('rejects invalid preferred languages', () => {
    const result = validateAppSettings({
      ...getDefaultAppSettings(),
      preferredLanguages: ['english'],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects non-object settings', () => {
    expect(validateAppSettings(null).ok).toBe(false);
    expect(validateAppSettings([]).ok).toBe(false);
  });

  it('rejects an empty preferred languages list', () => {
    const result = validateAppSettings({
      ...getDefaultAppSettings(),
      preferredLanguages: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.message).toBe(
      'preferredLanguages must be a non-empty array.',
    );
  });

  it('accepts system and regional locales but rejects malformed ones', () => {
    const base = getDefaultAppSettings();

    for (const locale of ['system', 'en', 'pt-BR']) {
      expect(validateAppSettings({ ...base, locale }).ok).toBe(true);
    }
    for (const locale of ['english', 'pt-br', 'EN']) {
      expect(validateAppSettings({ ...base, locale }).ok).toBe(false);
    }
  });

  it('enforces the image cache bounds', () => {
    const base = getDefaultAppSettings();

    expect(
      validateAppSettings({ ...base, imageCacheLimitBytes: MIN_IMAGE_CACHE_LIMIT_BYTES }).ok,
    ).toBe(true);
    expect(
      validateAppSettings({ ...base, imageCacheLimitBytes: MAX_IMAGE_CACHE_LIMIT_BYTES }).ok,
    ).toBe(true);

    for (const imageCacheLimitBytes of [
      MIN_IMAGE_CACHE_LIMIT_BYTES - 1,
      MAX_IMAGE_CACHE_LIMIT_BYTES + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(validateAppSettings({ ...base, imageCacheLimitBytes }).ok).toBe(false);
    }
  });
});
