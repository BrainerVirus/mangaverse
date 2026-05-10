import { describe, expect, it } from 'vitest';
import {
  getAllTitles,
  getCanonicalTitle,
  getDefaultProviderMapping,
  toMangaId,
  toProviderId,
  toProviderMappingId,
  toProviderMangaId,
  type MangaIdentity,
} from './manga';

describe('manga identity', () => {
  it('supports multiple provider mappings and a default', () => {
    const identity: MangaIdentity = {
      id: toMangaId('m1'),
      canonicalTitle: 'Test Manga',
      alternativeTitles: [{ value: 'Alternate Title' }],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing',
      contentRating: 'safe',
      language: 'en',
      merged: false,
      defaultProviderMappingId: toProviderMappingId('map-b'),
      providerMappings: [
        {
          id: toProviderMappingId('map-a'),
          providerId: toProviderId('p1'),
          providerMangaId: toProviderMangaId('pm1'),
        },
        {
          id: toProviderMappingId('map-b'),
          providerId: toProviderId('p2'),
          providerMangaId: toProviderMangaId('pm2'),
        },
      ],
    };

    expect(identity.providerMappings).toHaveLength(2);
    const def = getDefaultProviderMapping(identity);
    expect(def?.providerId).toEqual(toProviderId('p2'));
  });

  it('getDefaultProviderMapping returns undefined when default id missing', () => {
    const identity: MangaIdentity = {
      id: toMangaId('m1'),
      canonicalTitle: 'Missing Default',
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'unknown',
      contentRating: 'unknown',
      merged: false,
      defaultProviderMappingId: toProviderMappingId('missing'),
      providerMappings: [
        {
          id: toProviderMappingId('map-a'),
          providerId: toProviderId('p1'),
          providerMangaId: toProviderMangaId('pm1'),
        },
      ],
    };
    expect(getDefaultProviderMapping(identity)).toBeUndefined();
  });

  it('getCanonicalTitle and getAllTitles work', () => {
    const identity: MangaIdentity = {
      id: toMangaId('m1'),
      canonicalTitle: 'Canon',
      alternativeTitles: [{ value: 'Alt1' }, { value: 'Alt2' }],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing',
      contentRating: 'safe',
      merged: false,
      defaultProviderMappingId: toProviderMappingId('map-a'),
      providerMappings: [
        { id: toProviderMappingId('map-a'), providerId: toProviderId('p1'), providerMangaId: toProviderMangaId('pm1') },
      ],
    };
    expect(getCanonicalTitle(identity)).toBe('Canon');
    const all = getAllTitles(identity);
    expect(all).toHaveLength(3);
    expect(all).toContain('Canon');
    expect(all).toContain('Alt1');
    expect(all).toContain('Alt2');
  });
});
