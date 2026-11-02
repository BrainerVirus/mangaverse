import { describe, expect, it } from 'vitest';
import { toChapterId, toMangaId } from '@app/shared';
import {
  isMangadexAppMangaId,
  parseMangadexAppChapterId,
  parseMangadexAppMangaId,
  toMangadexAppChapterId,
  toMangadexAppMangaId,
  toMangadexChapterPageId,
} from './ids.js';
import { toMangadexChapterPages } from './identity-mapping.js';

const MANGA_UUID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
const CHAPTER_UUID = 'c7649b69-6d7a-466c-a428-ab9b086ebe35';

describe('MangaDex app ids', () => {
  it('Given a provider manga id, When converted, Then it keeps the historical dev-md prefix', () => {
    expect(String(toMangadexAppMangaId(MANGA_UUID))).toBe(`dev-md-${MANGA_UUID}`);
    expect(String(toMangadexAppChapterId(CHAPTER_UUID))).toBe(`dev-md-ch-${CHAPTER_UUID}`);
  });

  it('Given an app id, When parsed, Then the provider id round-trips', () => {
    expect(parseMangadexAppMangaId(toMangadexAppMangaId(MANGA_UUID))).toBe(MANGA_UUID);
    expect(parseMangadexAppChapterId(toMangadexAppChapterId(CHAPTER_UUID))).toBe(CHAPTER_UUID);
    expect(isMangadexAppMangaId(toMangadexAppMangaId(MANGA_UUID))).toBe(true);
  });

  it('Given an id from another provider, When parsed, Then it is not claimed', () => {
    expect(parseMangadexAppChapterId(toChapterId(`other-ch-${CHAPTER_UUID}`))).toBeNull();
    expect(isMangadexAppMangaId(toMangaId(`other-${MANGA_UUID}`))).toBe(false);
  });
});

describe('toMangadexChapterPages', () => {
  it('Given provider pages, When mapped, Then row ids are stable per chapter position', () => {
    const pages = toMangadexChapterPages(CHAPTER_UUID, [
      { index: 0, imageUrl: 'https://cdn.example/1.png' },
      { index: 1, imageUrl: 'https://cdn.example/2.png' },
    ]);

    expect(pages.map((page) => String(page.id))).toEqual([
      `dev-md-page-${CHAPTER_UUID}-0`,
      `dev-md-page-${CHAPTER_UUID}-1`,
    ]);
    expect(pages.map((page) => page.index)).toEqual([0, 1]);
    expect(pages[1]?.image.url).toBe('https://cdn.example/2.png');
    expect(String(toMangadexChapterPageId(CHAPTER_UUID, 0))).toBe(`dev-md-page-${CHAPTER_UUID}-0`);
  });
});
