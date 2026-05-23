import { describe, expect, it } from 'vitest';

import { getDefaultAppSettings, validateAppSettings } from './app-settings.js';

describe('app settings', () => {
  it('returns stable defaults', () => {
    expect(getDefaultAppSettings()).toEqual({
      explicitContent: false,
      showProviderErrors: true,
      preferredLanguages: ['en'],
      lowMemoryMode: false,
      locale: 'system',
    });
  });

  it('validates a complete settings object', () => {
    const result = validateAppSettings({
      explicitContent: true,
      showProviderErrors: false,
      preferredLanguages: ['en', 'ja'],
      lowMemoryMode: true,
      locale: 'pt-BR',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.preferredLanguages).toEqual(['en', 'ja']);
    }
  });

  it('rejects invalid preferred languages', () => {
    const result = validateAppSettings({
      ...getDefaultAppSettings(),
      preferredLanguages: ['english'],
    });

    expect(result.ok).toBe(false);
  });
});
