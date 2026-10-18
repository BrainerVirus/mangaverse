import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getChapter, listInstalledExtensions } = vi.hoisted(() => ({
  getChapter: vi.fn<(...args: unknown[]) => unknown>(),
  listInstalledExtensions: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('@app/db/browser', () => ({
  getChapter,
  getMangaIdentity: vi.fn<(...args: unknown[]) => unknown>(),
  listInstalledExtensions,
  upsertChapterWithPages: vi.fn<(...args: unknown[]) => unknown>(),
  upsertMangaIdentity: vi.fn<(...args: unknown[]) => unknown>(),
}));

import { ensureProviderChapterPages } from '../provider-query-options.js';

const db = {} as Parameters<typeof ensureProviderChapterPages>[0];
/** The historical app ids the MangaDex package produces (see its ids.ts). */
const CHAPTER_ID = 'dev-md-ch-c7649b69-6d7a-466c-a428-ab9b086ebe35';
const MANGA_ID = 'dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';

describe('ensureProviderChapterPages', () => {
  beforeEach(() => {
    getChapter.mockReset();
    listInstalledExtensions.mockReset();
  });

  it('Given the provider cannot be resolved, When a chapter has no pages, Then it rejects instead of leaving it silently empty', async () => {
    getChapter.mockResolvedValue({ id: CHAPTER_ID, mangaId: MANGA_ID, pages: [] });
    listInstalledExtensions.mockResolvedValue([]);

    await expect(ensureProviderChapterPages(db, CHAPTER_ID)).rejects.toThrow(
      /provider is not available/i,
    );
  });

  it('Given a chapter that already has pages, When ensuring, Then no provider resolution happens', async () => {
    getChapter.mockResolvedValue({
      id: CHAPTER_ID,
      mangaId: MANGA_ID,
      pages: [{ id: 'page-0', index: 0, image: { url: 'https://example.com/0.jpg' } }],
    });

    await expect(ensureProviderChapterPages(db, CHAPTER_ID)).resolves.toBeUndefined();
    expect(listInstalledExtensions).not.toHaveBeenCalled();
  });

  it('Given a chapter that no registered provider claims, When ensuring, Then it is left to its own provider', async () => {
    // This ensure has no provider chapter id for such a chapter and must not
    // report a failure another provider can still fix.
    await expect(ensureProviderChapterPages(db, 'other-ch-1')).resolves.toBeUndefined();
    expect(getChapter).not.toHaveBeenCalled();
    expect(listInstalledExtensions).not.toHaveBeenCalled();
  });

  it('Given a provider chapter whose manga belongs to no registered provider, When ensuring, Then no provider is resolved', async () => {
    getChapter.mockResolvedValue({ id: CHAPTER_ID, mangaId: 'other-manga', pages: [] });

    await expect(ensureProviderChapterPages(db, CHAPTER_ID)).resolves.toBeUndefined();
    expect(listInstalledExtensions).not.toHaveBeenCalled();
  });
});
