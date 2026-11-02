import { describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import type { ProviderManifest } from '@app/shared';

import { validateProviderSettings } from './settings';

const manifest = (overrides: Partial<ProviderManifest> = {}): ProviderManifest => ({
  id: toProviderId('p'),
  name: 'P',
  version: '1',
  source: { url: 'https://s' },
  compatibility: { platforms: ['web'] },
  capabilities: {
    'metadata.languages': true,
    'content.nsfw': true,
    'content.tagFilter': true,
    'content.ratingFilter': true,
    'auth.login': true,
  },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: true, suggestive: false, violence: false },
  ...overrides,
});

const errorOf = (input: unknown, m: ProviderManifest = manifest()) => {
  const res = validateProviderSettings(m, input);
  expect(res.ok).toBe(false);
  if (res.ok) throw new Error('expected failure');
  return res.error;
};

describe('validateProviderSettings shape validation', () => {
  it('rejects non-object settings', () => {
    for (const input of [null, 'nope', 5, []]) {
      const error = errorOf(input);
      expect(error.code).toBe('extensions.core.settings.invalid');
      expect(error.message).toBe('Provider settings must be an object.');
      expect(error.providerId).toBe('p');
    }
  });

  it('rejects a string where a tag array is expected', () => {
    const error = errorOf({ includedTags: 'nsfw' });
    expect(error.code).toBe('extensions.core.settings.invalid');
    expect(error.message).toContain('includedTags');
  });

  it('rejects arrays with non-string entries', () => {
    expect(errorOf({ includedTags: [1] }).code).toBe('extensions.core.settings.invalid');
    expect(errorOf({ preferredLanguages: 'en' }).code).toBe('extensions.core.settings.invalid');
    expect(errorOf({ excludedTags: {} }).code).toBe('extensions.core.settings.invalid');
  });

  it('rejects invalid content rating filters', () => {
    const error = errorOf({ contentRatingFilters: ['nsfw'] });
    expect(error.code).toBe('extensions.core.settings.invalid');
    expect(error.message).toContain('contentRatingFilters');
  });

  it('rejects invalid scalar fields', () => {
    expect(errorOf({ enabled: 'yes' }).code).toBe('extensions.core.settings.invalid');
    expect(errorOf({ nsfwAllowed: 1 }).code).toBe('extensions.core.settings.invalid');
    expect(errorOf({ regionLocale: 5 }).code).toBe('extensions.core.settings.invalid');
    expect(errorOf({ defaultSort: false }).code).toBe('extensions.core.settings.invalid');
    expect(errorOf({ authStatePlaceholder: 'later' }).code).toBe(
      'extensions.core.settings.invalid',
    );
    expect(errorOf({ providerOptions: [] }).code).toBe('extensions.core.settings.invalid');
  });

  it('strips unknown settings keys', () => {
    const res = validateProviderSettings(manifest(), { enabled: false, injected: 'nsfw' });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected res.ok to be true');
    expect(res.value).toEqual({ enabled: false });
  });

  it('accepts a complete settings object', () => {
    const settings = {
      enabled: false,
      preferredLanguages: ['en', 'ja'],
      nsfwAllowed: true,
      includedTags: ['action'],
      excludedTags: ['horror'],
      contentRatingFilters: ['safe', 'suggestive'],
      regionLocale: 'en-US',
      authStatePlaceholder: 'anonymous',
      providerOptions: { quality: 'high' },
      rateLimitOverrideRpm: 60,
      defaultSort: 'popular',
    } as const;
    const res = validateProviderSettings(manifest(), settings);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected res.ok to be true');
    expect(res.value).toEqual(settings);
  });
});

describe('validateProviderSettings capability checks', () => {
  it('keeps the unsupported capability error for nsfw', () => {
    const m = manifest({
      capabilities: { 'metadata.details': true },
      contentFlags: { nsfw: false, suggestive: false, violence: false },
    });
    const error = errorOf({ nsfwAllowed: true }, m);
    expect(error.code).toBe('extensions.core.settings.unsupported');
    expect(error.message).toBe('nsfwAllowed requires content.nsfw or compatible content flags.');
    expect(error.providerId).toBe('p');
  });

  it('keeps the unsupported capability error for tag filters', () => {
    const error = errorOf(
      { includedTags: ['action'] },
      manifest({ capabilities: { 'content.nsfw': true } }),
    );
    expect(error.code).toBe('extensions.core.settings.unsupported');
    expect(error.message).toBe('Tag filters require content.tagFilter capability.');
  });

  it('keeps the unsupported capability error for languages and ratings', () => {
    expect(errorOf({ preferredLanguages: ['en'] }, manifest({ capabilities: {} })).message).toBe(
      'preferredLanguages requires metadata.languages capability.',
    );
    expect(
      errorOf({ contentRatingFilters: ['safe'] }, manifest({ capabilities: {} })).message,
    ).toBe('contentRatingFilters requires content.ratingFilter capability.');
  });

  it('keeps the bad rate limit errors', () => {
    const negative = errorOf({ rateLimitOverrideRpm: -1 });
    expect(negative.code).toBe('extensions.core.settings.bad_rate_limit');
    expect(negative.message).toBe('rateLimitOverrideRpm must be a non-negative number.');

    const tooHigh = errorOf({ rateLimitOverrideRpm: 10_001 });
    expect(tooHigh.code).toBe('extensions.core.settings.bad_rate_limit');
    expect(tooHigh.message).toBe('rateLimitOverrideRpm must be at most 10000.');

    const notANumber = errorOf({ rateLimitOverrideRpm: '60' });
    expect(notANumber.code).toBe('extensions.core.settings.bad_rate_limit');
    expect(notANumber.message).toBe('rateLimitOverrideRpm must be a non-negative number.');
  });
});
