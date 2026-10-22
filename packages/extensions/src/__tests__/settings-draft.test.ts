import { describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import type { ProviderManifest, ProviderSettingsValues } from '@app/shared';

import { applyExplicitContentGate } from '../provider-settings.js';
import {
  draftFromSettings,
  emptyProviderSettingsDraft,
  hasEditableProviderSettings,
  providerSettingsSupport,
  settingsFromDraft,
} from '../settings-draft.js';

const manifest = (overrides: Partial<ProviderManifest> = {}): ProviderManifest => ({
  id: toProviderId('p'),
  name: 'P',
  version: '1',
  source: { url: 'https://p.example' },
  compatibility: { platforms: ['web'] },
  capabilities: {
    'metadata.languages': true,
    'content.nsfw': true,
    'content.ratingFilter': true,
    'content.tagFilter': true,
  },
  capabilityDetails: [{ key: 'ops.officialApi', supported: true, rateLimitRpm: 40 }],
  settingsSupport: {
    regionLocales: ['en-US', 'ja-JP'],
    defaultSorts: ['latest', 'popular'],
    providerOptionKeys: ['quality'],
  },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: true, suggestive: true, violence: false },
  ...overrides,
});

describe('providerSettingsSupport', () => {
  it('reads capability and manifest declarations', () => {
    const support = providerSettingsSupport(manifest());
    expect(support).toEqual({
      languages: true,
      nsfw: true,
      ratings: true,
      tags: true,
      auth: false,
      rateLimit: true,
      regionLocales: ['en-US', 'ja-JP'],
      defaultSorts: ['latest', 'popular'],
      providerOptionKeys: ['quality'],
    });
    expect(hasEditableProviderSettings(support)).toBe(true);
  });

  it('hides every setting a provider does not declare', () => {
    const support = providerSettingsSupport(
      manifest({
        capabilities: { 'discovery.search': true },
        capabilityDetails: [],
        settingsSupport: {},
      }),
    );
    expect(hasEditableProviderSettings(support)).toBe(false);
  });

  it('detects auth capabilities', () => {
    expect(providerSettingsSupport(manifest({ capabilities: { 'auth.login': true } })).auth).toBe(
      true,
    );
  });
});

describe('settingsFromDraft', () => {
  it('trims, splits, dedupes and drops empty values', () => {
    const support = providerSettingsSupport(manifest());
    const result = settingsFromDraft(
      {
        ...emptyProviderSettingsDraft(),
        preferredLanguages: ' en, ja , en, ',
        includedTags: 'tag-a, tag-b',
        excludedTags: ' ',
        regionLocale: ' ',
        defaultSort: '',
        rateLimitOverrideRpm: '',
        providerOptions: { quality: ' high ' },
      },
      support,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected settings');
    expect(result.value).toEqual({
      preferredLanguages: ['en', 'ja'],
      nsfwAllowed: false,
      includedTags: ['tag-a', 'tag-b'],
      providerOptions: { quality: 'high' },
    });
  });

  it('keeps an explicit nsfw off value and rating list', () => {
    const support = providerSettingsSupport(manifest());
    const result = settingsFromDraft(
      {
        ...emptyProviderSettingsDraft(),
        nsfwAllowed: false,
        contentRatingFilters: ['safe', 'explicit'],
      },
      support,
    );
    if (!result.ok) throw new Error('expected settings');
    expect(result.value.nsfwAllowed).toBe(false);
    expect(result.value.contentRatingFilters).toEqual(['safe', 'explicit']);
  });

  it('rejects a non-numeric rate limit instead of saving it', () => {
    const support = providerSettingsSupport(manifest());
    const result = settingsFromDraft(
      { ...emptyProviderSettingsDraft(), rateLimitOverrideRpm: 'fast' },
      support,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('extensions.core.settings.bad_rate_limit');
  });

  it('sends only fields the manifest declares', () => {
    const support = providerSettingsSupport(
      manifest({
        capabilities: { 'metadata.languages': true },
        capabilityDetails: [],
        settingsSupport: {},
      }),
    );
    const result = settingsFromDraft(
      {
        ...emptyProviderSettingsDraft(),
        preferredLanguages: 'ja',
        nsfwAllowed: true,
        includedTags: 'tag-a',
        regionLocale: 'en-US',
        defaultSort: 'popular',
        rateLimitOverrideRpm: '10',
      },
      support,
    );
    if (!result.ok) throw new Error('expected settings');
    expect(result.value).toEqual({ preferredLanguages: ['ja'] });
  });

  it('round-trips saved settings into a draft', () => {
    const saved: ProviderSettingsValues = {
      preferredLanguages: ['en', 'ja'],
      nsfwAllowed: true,
      contentRatingFilters: ['safe'],
      includedTags: ['a'],
      excludedTags: ['b'],
      regionLocale: 'en-US',
      rateLimitOverrideRpm: 30,
      defaultSort: 'popular',
      providerOptions: { quality: 'high' },
    };
    expect(draftFromSettings(saved)).toMatchObject({
      preferredLanguages: 'en, ja',
      contentRatingFilters: ['safe'],
      rateLimitOverrideRpm: '30',
      providerOptions: { quality: 'high' },
    });
    const support = providerSettingsSupport(manifest());
    const result = settingsFromDraft(draftFromSettings(saved), support);
    if (!result.ok) throw new Error('expected settings');
    expect(result.value).toEqual(saved);
  });
});

describe('applyExplicitContentGate', () => {
  it('forces NSFW off and strips mature ratings when app explicit content is disabled', () => {
    const gated = applyExplicitContentGate(
      { nsfwAllowed: true, contentRatingFilters: ['safe', 'mature', 'explicit'] },
      false,
    );
    expect(gated.nsfwAllowed).toBe(false);
    expect(gated.contentRatingFilters).toEqual(['safe']);
  });

  it('leaves settings untouched when app explicit content is enabled', () => {
    const settings: ProviderSettingsValues = {
      nsfwAllowed: true,
      contentRatingFilters: ['safe', 'explicit'],
    };
    expect(applyExplicitContentGate(settings, true)).toBe(settings);
  });
});
