import { describe, expect, it } from 'vitest';

import { MANGADEX_MANIFEST } from './manifest.js';
import { createMangaDexProvider } from './provider.js';

const ctx = { manifest: MANGADEX_MANIFEST, providerId: 'mangadex' };

function chapterEntity(n: number) {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    attributes: { chapter: String(n), title: `Chapter ${n}` },
  };
}

describe('MangaDex chapter feed pagination', () => {
  it('Given an empty feed, When chapters are requested, Then an empty list resolves without error', async () => {
    const provider = createMangaDexProvider({
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(provider.getChapters!(ctx, 'manga-1' as never)).resolves.toEqual([]);
  });

  it('Given a feed with an unreadable chapter and a duplicate index, When chapters are requested, Then only readable unique chapters remain', async () => {
    const provider = createMangaDexProvider({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                attributes: { chapter: '1', title: 'A', pages: 10 },
              },
              {
                id: '00000000-0000-4000-8000-000000000002',
                attributes: { chapter: '1', title: 'dup', pages: 8 },
              },
              {
                id: '00000000-0000-4000-8000-000000000003',
                attributes: { chapter: '2', title: 'B', pages: 0 },
              },
              {
                id: '00000000-0000-4000-8000-000000000004',
                attributes: { chapter: '3', title: 'C', pages: 5 },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    const chapters = await provider.getChapters!(ctx, 'manga-1' as never);
    expect(chapters.map((chapter) => chapter.index)).toEqual([1, 3]);
    expect(chapters[0]?.id).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('Given a full page followed by a partial page, When chapters are requested, Then both pages are fetched and merged in order', async () => {
    const first = Array.from({ length: 100 }, (_v, index) => chapterEntity(index + 1));
    const second = [chapterEntity(101), chapterEntity(102)];
    const requests: string[] = [];
    const provider = createMangaDexProvider({
      fetchImpl: async (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        requests.push(url);
        const offset = Number(new URL(url).searchParams.get('offset') ?? '0');
        const data = offset === 0 ? first : second;
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const chapters = await provider.getChapters!(ctx, 'manga-1' as never);
    expect(chapters).toHaveLength(102);
    expect(requests).toHaveLength(2);
    expect(chapters[0]?.index).toBe(1);
    expect(chapters[101]?.index).toBe(102);
  });
});
