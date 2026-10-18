import { describe, expect, it } from 'vitest';
import { MANGADEX_PAYLOAD_INVALID } from './errors.js';
import {
  parseAtHomeResponse,
  parseCollectionResponse,
  parseDetailResponse,
  parseFeedResponse,
} from './schemas.js';
import { loadFixtureJson } from './testing/load-fixture.js';

describe('MangaDex schemas', () => {
  it('Given the recorded search fixture, When parsed, Then entities and total are read', () => {
    const collection = parseCollectionResponse(loadFixtureJson('search.json'), '/manga');
    expect(collection.entities.length).toBeGreaterThan(0);
    expect(collection.entities[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof collection.total).toBe('number');
  });

  it('Given the recorded detail fixture, When parsed, Then relationships include cover_art', () => {
    const entity = parseDetailResponse(loadFixtureJson('detail.json'), '/manga/{id}');
    const types = (entity.relationships ?? []).map((rel) => rel.type);
    expect(types).toContain('cover_art');
    expect(types).toContain('author');
  });

  it('Given the recorded feed fixture, When parsed, Then chapter attributes are read', () => {
    const feed = parseFeedResponse(loadFixtureJson('feed.json'), '/manga/{id}/feed');
    expect(feed.chapters.length).toBeGreaterThan(0);
    expect(feed.chapters[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('Given the recorded at-home fixture, When parsed, Then data and saver renditions are read', () => {
    const atHome = parseAtHomeResponse(loadFixtureJson('at-home.json'), '/at-home/server/{id}');
    expect(atHome.baseUrl).toMatch(/^https:\/\//);
    expect(atHome.hash.length).toBeGreaterThan(0);
    expect(atHome.data.length).toBeGreaterThan(0);
    expect(atHome.dataSaver.length).toBe(atHome.data.length);
  });

  it('Given a broken payload, When parsed, Then it throws a normalized payload error', () => {
    expect(() => parseCollectionResponse({ data: [{ id: 'x' }] }, '/manga')).toThrowError(
      expect.objectContaining({ code: MANGADEX_PAYLOAD_INVALID }),
    );
  });

  it('Given an entity without a usable title, When parsed, Then drift throws with the endpoint', () => {
    const broken = {
      data: [{ id: '00000000-0000-4000-8000-000000000001', attributes: { title: {} } }],
    };
    expect(() => parseCollectionResponse(broken, '/manga')).toThrowError(
      expect.objectContaining({
        code: MANGADEX_PAYLOAD_INVALID,
        details: expect.objectContaining({ endpoint: '/manga' }),
      }),
    );
  });

  it('Given an at-home payload without saver renditions, When parsed, Then saver defaults to empty', () => {
    const atHome = parseAtHomeResponse(
      { baseUrl: 'https://x.example', chapter: { hash: 'h', data: ['1.png'] } },
      '/at-home/server/{id}',
    );
    expect(atHome.dataSaver).toEqual([]);
  });
});
