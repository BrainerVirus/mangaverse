import { describe, expect, it } from 'vitest';

import { getDefaultAppSettings, validateAppSettings } from './app-settings.js';

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
});
