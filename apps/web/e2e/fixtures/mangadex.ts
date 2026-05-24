export const mangadexCoverBaseUrl = 'https://uploads.mangadex.org/covers';

export const mangadexListFixture = {
  data: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      attributes: {
        title: { en: 'Berserk' },
        status: 'ongoing',
        contentRating: 'safe',
      },
      relationships: [
        {
          type: 'cover_art',
          id: 'cover-1',
          attributes: { fileName: 'cover-1.jpg' },
        },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      attributes: {
        title: { en: 'Chainsaw Man' },
        status: 'ongoing',
        contentRating: 'suggestive',
      },
      relationships: [
        {
          type: 'cover_art',
          id: 'cover-2',
          attributes: { fileName: 'cover-2.jpg' },
        },
      ],
    },
  ],
  included: [
    { id: 'cover-1', attributes: { fileName: 'cover-1.jpg' } },
    { id: 'cover-2', attributes: { fileName: 'cover-2.jpg' } },
  ],
};

export const mangadexRecentFixture = {
  data: [
    {
      id: '00000000-0000-0000-0000-000000000004',
      attributes: {
        title: { en: 'Recent Title' },
        status: 'ongoing',
        contentRating: 'safe',
      },
      relationships: [
        {
          type: 'cover_art',
          id: 'cover-4',
          attributes: { fileName: 'cover-4.jpg' },
        },
      ],
    },
  ],
  included: [{ id: 'cover-4', attributes: { fileName: 'cover-4.jpg' } }],
};

export const mangadexExplicitFixture = {
  data: [
    {
      id: '00000000-0000-0000-0000-000000000003',
      attributes: {
        title: { en: 'Explicit Title' },
        status: 'ongoing',
        contentRating: 'pornographic',
      },
      relationships: [
        {
          type: 'cover_art',
          id: 'cover-3',
          attributes: { fileName: 'cover-3.jpg' },
        },
      ],
    },
  ],
  included: [{ id: 'cover-3', attributes: { fileName: 'cover-3.jpg' } }],
};

export const devManifestFixture = {
  id: 'mangadex',
  name: 'MangaDex (Local Dev)',
  version: '0.1.0-dev',
  description: 'Minimal MangaDex provider for local development and manual testing.',
  source: {
    url: 'https://mangadex.org',
    homepageUrl: 'https://mangadex.org',
    manifestUrl: 'http://127.0.0.1:5173/__dev/providers/mangadex/manifest.json',
    publisher: 'MangaVerse Local Dev',
  },
  compatibility: {
    platforms: ['web', 'desktop'],
  },
  capabilities: {
    'discovery.search': true,
    'discovery.latest': true,
    'discovery.popular': true,
    'discovery.browse': true,
    'metadata.details': true,
    'metadata.chapters': true,
    'metadata.pages': true,
    'ops.officialApi': true,
  },
  permissions: ['network.http', 'storage.local'],
  languages: ['en', 'ja', 'es', 'pt-br'],
  contentFlags: {
    nsfw: true,
    suggestive: true,
    violence: true,
  },
};
