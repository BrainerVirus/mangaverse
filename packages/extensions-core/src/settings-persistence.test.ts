import { describe, expect, it } from 'vitest';
import { toProviderId, type ContentRating } from '@app/shared';
import type { ProviderManifest } from '@app/shared';
import { createSqlJsHarness } from '@app/db/testing';

import { getProviderSettings, saveProviderSettings } from './settings-persistence';
import { recordToSettings } from './settings-persistence.js';

const VALID_RATINGS: ContentRating[] = ['unknown', 'safe', 'suggestive', 'mature', 'explicit'];

function makeBaseRecord(): Record<string, unknown> {
  return {
    enabled: true,
    preferredLanguages: ['en'],
    nsfwAllowed: false,
    includedTags: ['action'],
    excludedTags: ['drama'],
    contentRatingFilters: ['safe'] as unknown[],
    regionLocale: 'en-US',
    authStatePlaceholder: 'anonymous',
    providerOptions: {},
    rateLimitOverrideRpm: 30,
    defaultSort: 'popularity',
  };
}

const manifest = (): ProviderManifest => ({
  id: toProviderId('demo-settings'),
  name: 'Demo',
  version: '1',
  source: { url: 'https://example.com' },
  compatibility: { platforms: ['web'] },
  capabilities: {
    'metadata.languages': true,
    'content.nsfw': true,
  },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: true, suggestive: false, violence: false },
});

describe('recordToSettings sanitization', () => {
  it('omits preferredLanguages when array contains non-string values', () => {
    const record = makeBaseRecord();
    record['preferredLanguages'] = ['en', 1, 'fr'] as unknown[];
    const result = recordToSettings(record);
    expect(result.preferredLanguages).toBeUndefined();
  });

  it('omits includedTags when array contains null', () => {
    const record = makeBaseRecord();
    record['includedTags'] = ['action', null] as unknown[];
    const result = recordToSettings(record);
    expect(result.includedTags).toBeUndefined();
  });

  it('omits excludedTags when array contains non-string values', () => {
    const record = makeBaseRecord();
    record['excludedTags'] = [null, 'drama'] as unknown[];
    const result = recordToSettings(record);
    expect(result.excludedTags).toBeUndefined();
  });

  it('omits contentRatingFilters when array contains invalid value', () => {
    const record = makeBaseRecord();
    record['contentRatingFilters'] = ['safe', 'invalid-value'] as unknown[];
    const result = recordToSettings(record);
    expect(result.contentRatingFilters).toBeUndefined();
  });

  it('keeps contentRatingFilters when all values are valid', () => {
    const record = makeBaseRecord();
    record['contentRatingFilters'] = ['safe', 'suggestive'] as unknown[];
    const result = recordToSettings(record);
    expect(result.contentRatingFilters).toEqual(['safe', 'suggestive']);
  });

  it('keeps preferredLanguages when all elements are strings', () => {
    const record = makeBaseRecord();
    record['preferredLanguages'] = ['en', 'fr', 'ja'] as unknown[];
    const result = recordToSettings(record);
    expect(result.preferredLanguages).toEqual(['en', 'fr', 'ja']);
  });

  it('keeps includedTags when all elements are strings', () => {
    const record = makeBaseRecord();
    record['includedTags'] = ['action', 'comedy', 'romance'] as unknown[];
    const result = recordToSettings(record);
    expect(result.includedTags).toEqual(['action', 'comedy', 'romance']);
  });
});

describe('saveProviderSettings / getProviderSettings', () => {
  it('round-trips valid settings', async () => {
    const { db } = await createSqlJsHarness();
    const m = manifest();
    const write = await saveProviderSettings(m, { preferredLanguages: ['en'], nsfwAllowed: true }, { db });
    expect(write.ok).toBe(true);
    const read = await getProviderSettings(String(m.id), { db });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.preferredLanguages).toEqual(['en']);
      expect(read.value.nsfwAllowed).toBe(true);
    }
  });

  it('does not persist invalid settings', async () => {
    const { db } = await createSqlJsHarness();
    const m: ProviderManifest = {
      ...manifest(),
      capabilities: { 'metadata.details': true },
      contentFlags: { nsfw: false, suggestive: false, violence: false },
    };
    const write = await saveProviderSettings(m, { nsfwAllowed: true }, { db });
    expect(write.ok).toBe(false);
    const read = await getProviderSettings(String(m.id), { db });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.nsfwAllowed).toBeUndefined();
  });
});