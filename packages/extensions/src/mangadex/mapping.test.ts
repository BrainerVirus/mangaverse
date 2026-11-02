import { describe, expect, it } from 'vitest';
import { toChapters, toDetails, toPages, toSearchItem } from './mapping.js';
import {
  parseAtHomeResponse,
  parseCollectionResponse,
  parseDetailResponse,
  parseFeedResponse,
} from './schemas.js';
import { loadFixtureJson } from './testing/load-fixture.js';

const detail = parseDetailResponse(loadFixtureJson('detail.json'), '/manga/{id}');
const search = parseCollectionResponse(loadFixtureJson('search.json'), '/manga');
const feed = parseFeedResponse(loadFixtureJson('feed.json'), '/manga/{id}/feed');
const atHome = parseAtHomeResponse(loadFixtureJson('at-home.json'), '/at-home/server/{id}');

describe('MangaDex mapping', () => {
  it('Given a search entity, When mapped, Then the cover URL points at the recorded cover file', () => {
    const item = toSearchItem(search.entities[0]!);
    expect(String(item.providerMangaId)).toBe(search.entities[0]!.id);
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.coverUrl).toMatch(
      new RegExp(
        `^https://uploads\\.mangadex\\.org/covers/${search.entities[0]!.id}/.+\\.256\\.jpg$`,
      ),
    );
  });

  it('Given the detail fixture, When mapped, Then titles include the English canonical and alt titles', () => {
    const details = toDetails(detail);
    const values = details.titles.map((title) => title.value);
    expect(values.length).toBeGreaterThan(0);
    expect(values.some((value) => value.length > 0)).toBe(true);
    expect(details.contentRating).toMatch(/^(safe|suggestive|explicit|unknown)$/);
  });

  it('Given feed entities, When mapped, Then readable chapters are sorted with unique parsed indices', () => {
    const chapters = toChapters(feed.chapters);
    // The recorded feed contains a duplicate chapter number with pages: 0;
    // only the readable unique chapter survives.
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.index).toBe(1);
    expect(chapters[0]?.title).toBe('Ch. 1 - The Summoner');
    for (const chapter of chapters) {
      expect(chapter.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(chapter.title.length).toBeGreaterThan(0);
    }
  });

  it('Given saver renditions, When mapped at data-saver, Then the saver folder and files are used', () => {
    const pages = toPages(atHome, 'data-saver');
    expect(pages.length).toBe(atHome.dataSaver.length);
    expect(pages[0]?.imageUrl).toBe(
      `${atHome.baseUrl}/data-saver/${atHome.hash}/${atHome.dataSaver[0]}`,
    );
  });

  it('Given a chapter without saver renditions, When mapped at data-saver, Then both folder and files fall back together', () => {
    const pages = toPages(
      { baseUrl: 'https://x.example', hash: 'h', data: ['1.png', '2.png'], dataSaver: [] },
      'data-saver',
    );
    expect(pages.map((page) => page.imageUrl)).toEqual([
      'https://x.example/data/h/1.png',
      'https://x.example/data/h/2.png',
    ]);
  });

  it('Given original quality, When mapped, Then the data folder is used even when saver files exist', () => {
    const pages = toPages(atHome, 'data');
    expect(pages[0]?.imageUrl).toBe(`${atHome.baseUrl}/data/${atHome.hash}/${atHome.data[0]}`);
  });
});
