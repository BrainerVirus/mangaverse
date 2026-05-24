import { describe, expect, it, vi, afterEach } from 'vitest';
import { toMangaId } from '@app/shared';
import {
  DEV_MANGADEX_SECTION_DEFINITIONS,
  fetchDevMangaDetail,
  fetchDevMangaDexChapters,
  fetchDevMangaDexSectionPage,
  fetchDevMangaDexSectionPreviews,
  getCurrentAnimeSeason,
  getDevMangaDexSectionTitle,
  getSeasonalSectionTitle,
  resolveMangaDexCoverUrl,
  toDevMangaDexChapterId,
} from '../dev-mangadex-search.js';

const RENCHI_MANGA_ID = 'a34cf998-e065-441b-acf4-0132527abf96';
const RENCHI_CHAPTER_ID = 'ad5ae837-5e47-4c90-bb69-50f1c9a08518';

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

describe('seasonal discover helpers', () => {
  it('labels the current anime season dynamically', () => {
    expect(getSeasonalSectionTitle(new Date('2026-05-24T00:00:00.000Z'))).toBe('Seasonal: Spring 2026');
    expect(getCurrentAnimeSeason(new Date('2026-01-15T00:00:00.000Z'))).toEqual({
      name: 'Winter',
      year: 2026,
    });
  });

  it('resolves section titles including seasonal', () => {
    expect(getDevMangaDexSectionTitle('recommended')).toBe('Recommended');
    expect(getDevMangaDexSectionTitle('seasonal', new Date('2026-05-24T00:00:00.000Z'))).toBe(
      'Seasonal: Spring 2026',
    );
  });
});

describe('dev MangaDex chapter ids', () => {
  it('maps chapter ids deterministically', () => {
    expect(String(toDevMangaDexChapterId(RENCHI_CHAPTER_ID))).toBe(`dev-md-ch-${RENCHI_CHAPTER_ID}`);
  });
});

describe('fetchDevMangaDetail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns chapters for Renchi to Kudamono', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes(`/manga/${RENCHI_MANGA_ID}/feed`)) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: RENCHI_CHAPTER_ID,
                  attributes: {
                    chapter: '1',
                    title: 'The End and The Beginning',
                    publishAt: '2026-05-24T16:08:45+00:00',
                    pages: 51,
                  },
                },
              ],
              total: 1,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (url.includes(`/manga/${RENCHI_MANGA_ID}`)) {
          return new Response(
            JSON.stringify({
              data: {
                id: RENCHI_MANGA_ID,
                attributes: {
                  title: { en: 'Renchi to Kudamono' },
                  description: { en: 'A manga about tools and fruit.' },
                  status: 'ongoing',
                  contentRating: 'safe',
                },
                relationships: [],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response('not found', { status: 404 });
      }),
    );

    const detail = await fetchDevMangaDetail(toMangaId(`dev-md-${RENCHI_MANGA_ID}`));
    expect(detail).not.toBeNull();
    expect(detail?.manga.canonicalTitle).toBe('Renchi to Kudamono');
    expect(detail?.chapters).toHaveLength(1);
    expect(detail?.chapters[0]?.title).toContain('The End and The Beginning');
    expect(detail?.continueChapterId).toBe(toDevMangaDexChapterId(RENCHI_CHAPTER_ID));
  });
});

describe('fetchDevMangaDexChapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps feed entries into chapter metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: RENCHI_CHAPTER_ID,
                attributes: { chapter: '1', title: 'The End and The Beginning' },
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const chapters = await fetchDevMangaDexChapters(
      RENCHI_MANGA_ID,
      toMangaId(`dev-md-${RENCHI_MANGA_ID}`),
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.providerChapterId).toBe(RENCHI_CHAPTER_ID);
    expect(chapters[0]?.pages).toEqual([]);
  });
});

describe('fetchDevMangaDexSectionPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['recommended', 'order%5Brelevance%5D'],
    ['selfPublished', 'includedTags'],
    ['seasonal', 'createdAtSince'],
    ['latest', 'latestUploadedChapter'],
    ['recent', 'createdAt'],
  ] as const)('builds query params for %s section', async (sectionId, expectedParam) => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchDevMangaDexSectionPage(sectionId, 0, 6, true);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(expectedParam);
    if (sectionId === 'seasonal') {
      expect(url).toContain('createdAtSince=2026-04-01T00%3A00%3A00');
      expect(url).not.toContain('.000Z');
    }
  });
});

describe('fetchDevMangaDexSectionPreviews', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns successful sections when one section request fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('createdAtSince')) {
        return new Response('bad request', { status: 400 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              attributes: { title: { en: 'Popular Title' }, contentRating: 'safe', status: 'ongoing' },
              relationships: [],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const sections = await fetchDevMangaDexSectionPreviews(
      DEV_MANGADEX_SECTION_DEFINITIONS,
      true,
      1,
    );

    expect(sections.some((section) => section.id === 'popular')).toBe(true);
    expect(sections.some((section) => section.id === 'seasonal')).toBe(false);
    expect(sections.length).toBeGreaterThan(0);
  });
});
