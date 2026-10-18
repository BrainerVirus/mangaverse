import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getChapter, resolveInstalledProvider } = vi.hoisted(() => ({
  getChapter: vi.fn<(...args: unknown[]) => unknown>(),
  resolveInstalledProvider: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('@app/db/browser', () => ({
  getChapter,
  getMangaIdentity: vi.fn<(...args: unknown[]) => unknown>(),
  upsertChapterWithPages: vi.fn<(...args: unknown[]) => unknown>(),
  upsertMangaIdentity: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('../../lib/provider-registry.js', () => ({ resolveInstalledProvider }));

import { ensureMangadexChapterPages } from '../mangadex-query-options.js';

const db = {} as Parameters<typeof ensureMangadexChapterPages>[0];
const CHAPTER_ID = 'dev-md-ch-c7649b69-6d7a-466c-a428-ab9b086ebe35';
const MANGA_ID = 'dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';

describe('ensureMangadexChapterPages', () => {
  beforeEach(() => {
    getChapter.mockReset();
    resolveInstalledProvider.mockReset();
  });

  it('Given the provider cannot be resolved, When a chapter has no pages, Then it rejects instead of leaving it silently empty', async () => {
    getChapter.mockResolvedValue({ id: CHAPTER_ID, mangaId: MANGA_ID, pages: [] });
    resolveInstalledProvider.mockResolvedValue(null);

    await expect(ensureMangadexChapterPages(db, CHAPTER_ID)).rejects.toThrow(
      /provider is not available/i,
    );
  });

  it('Given a chapter that already has pages, When ensuring, Then no provider resolution happens', async () => {
    getChapter.mockResolvedValue({
      id: CHAPTER_ID,
      mangaId: MANGA_ID,
      pages: [{ id: 'page-0', index: 0, image: { url: 'https://example.com/0.jpg' } }],
    });

    await expect(ensureMangadexChapterPages(db, CHAPTER_ID)).resolves.toBeUndefined();
    expect(resolveInstalledProvider).not.toHaveBeenCalled();
  });
});
