import type { ProviderManifest } from '@app/shared';
import { toProviderId } from '@app/shared';

/**
 * First-party MangaDex manifest. Capabilities are declared only for methods
 * this package actually implements; the SDK contract test enforces that.
 */
export const MANGADEX_MANIFEST: ProviderManifest = {
  id: toProviderId('mangadex'),
  name: 'MangaDex',
  version: '0.1.0',
  description: 'Official MangaDex API provider (search, details, chapters, pages).',
  source: {
    url: 'https://mangadex.org',
    homepageUrl: 'https://mangadex.org',
    publisher: 'MangaDex',
  },
  compatibility: {
    platforms: ['web', 'desktop', 'mobile'],
  },
  capabilities: {
    'discovery.search': true,
    'discovery.latest': true,
    'discovery.popular': true,
    'metadata.details': true,
    'metadata.chapters': true,
    'metadata.pages': true,
    'metadata.languages': true,
    'content.nsfw': true,
    'content.ratingFilter': true,
    'content.tagFilter': true,
    'ops.officialApi': true,
  },
  capabilityDetails: [
    { key: 'ops.officialApi', supported: true, rateLimitRpm: 40 },
    {
      key: 'metadata.chapters',
      supported: true,
      knownRestrictions: [
        'Translated chapters follow the preferred languages; English by default.',
      ],
    },
  ],
  settingsSupport: {
    defaultSorts: ['latest', 'popular'],
  },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: {
    nsfw: true,
    suggestive: true,
    violence: true,
  },
};
