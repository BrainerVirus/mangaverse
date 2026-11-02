import { describe, expect, it } from 'vitest';
import { toProviderMangaId } from '@app/shared';
import {
  buildMangaDetailData,
  providerChapterToChapter,
  providerDetailsToMangaIdentity,
  providerItemToMangaIdentity,
} from './identity-mapping.js';

const MANGA_UUID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
const CHAPTER_UUID = 'c7649b69-6d7a-466c-a428-ab9b086ebe35';
const details = {
  providerMangaId: toProviderMangaId(MANGA_UUID),
  titles: [
    { value: 'Canonical', locale: 'en' },
    { value: 'Alt', locale: 'ja' },
  ],
  tags: [{ id: 'tag-1', label: 'Action' }],
  coverUrl: 'https://uploads.mangadex.org/covers/x/1.256.jpg',
};

describe('MangaDex identity mapping', () => {
  it('Given a search item, When mapped, Then the identity carries the app id and a mangadex.org mapping', () => {
    const identity = providerItemToMangaIdentity({
      providerMangaId: toProviderMangaId(MANGA_UUID),
      title: 'Search Title',
      coverUrl: 'https://uploads.mangadex.org/covers/x/2.256.jpg',
    });

    expect(String(identity.id)).toBe(`dev-md-${MANGA_UUID}`);
    expect(identity.canonicalTitle).toBe('Search Title');
    expect(identity.defaultProviderMappingId).toBe(`dev-md-map-${MANGA_UUID}`);
    expect(identity.providerMappings[0]).toMatchObject({
      providerId: 'mangadex',
      providerUrl: `https://mangadex.org/title/${MANGA_UUID}`,
    });
  });

  it('Given provider details, When mapped, Then alt titles and tags survive', () => {
    const identity = providerDetailsToMangaIdentity(MANGA_UUID, details);
    expect(identity.canonicalTitle).toBe('Canonical');
    expect(identity.alternativeTitles).toEqual([{ value: 'Alt', locale: 'ja' }]);
    expect(identity.tags).toEqual([{ id: 'tag-1', label: 'Action' }]);
  });

  it('Given a chapter, When mapped, Then it points at the app manga id and the provider chapter id', () => {
    const chapter = providerChapterToChapter(MANGA_UUID, {
      id: CHAPTER_UUID,
      title: 'Chapter 1',
      index: 1,
      publishedAt: '2026-01-01T00:00:00Z',
    });
    expect(String(chapter.id)).toBe(`dev-md-ch-${CHAPTER_UUID}`);
    expect(String(chapter.mangaId)).toBe(`dev-md-${MANGA_UUID}`);
    expect(chapter.providerChapterId).toBe(CHAPTER_UUID);
    expect(chapter.providerId).toBe('mangadex');
    expect(chapter.pages).toEqual([]);
  });

  it('Given details and chapters, When built, Then the first mapped chapter is the continue point', () => {
    const detail = buildMangaDetailData(MANGA_UUID, details, [
      { id: CHAPTER_UUID, title: 'Chapter 1', index: 1 },
    ]);
    expect(String(detail.manga.id)).toBe(`dev-md-${MANGA_UUID}`);
    expect(detail.chapters).toHaveLength(1);
    expect(String(detail.continueChapterId)).toBe(`dev-md-ch-${CHAPTER_UUID}`);
    expect(detail.libraryEntry).toBeUndefined();
  });
});
