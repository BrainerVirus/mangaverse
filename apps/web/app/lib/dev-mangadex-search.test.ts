import { describe, expect, it } from 'vitest';
import { resolveMangaDexCoverUrl } from './dev-mangadex-search.js';

describe('resolveMangaDexCoverUrl', () => {
  it('reads cover filenames from relationship attributes', () => {
    const manga = {
      id: '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
      attributes: { title: { en: 'Solo Leveling' } },
      relationships: [
        {
          type: 'cover_art',
          id: 'e6583e52-1125-4c50-8db4-e8d6cf3fb144',
          attributes: { fileName: 'e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg' },
        },
      ],
    };

    expect(resolveMangaDexCoverUrl({ data: [manga] }, manga)).toBe(
      'https://uploads.mangadex.org/covers/32d76d19-8a05-4db0-9fc2-e0b0648fe9d0/e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg.256.jpg',
    );
  });

  it('falls back to included cover art entries', () => {
    const manga = {
      id: '00000000-0000-0000-0000-000000000001',
      attributes: { title: { en: 'Berserk' } },
      relationships: [{ type: 'cover_art', id: 'cover-1' }],
    };

    expect(
      resolveMangaDexCoverUrl(
        {
          data: [manga],
          included: [{ id: 'cover-1', attributes: { fileName: 'cover-1.jpg' } }],
        },
        manga,
      ),
    ).toBe(
      'https://uploads.mangadex.org/covers/00000000-0000-0000-0000-000000000001/cover-1.jpg.256.jpg',
    );
  });
});
