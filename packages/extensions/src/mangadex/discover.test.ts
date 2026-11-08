import { describe, expect, it } from 'vitest';
import { MANGADEX_SECTION_DEFINITIONS } from './discover.js';
import { MANGADEX_MANIFEST } from './manifest.js';
import { createMangaDexProvider } from './provider.js';
import { createFixtureFetch } from './testing/fixture-fetch.js';

describe('MangaDex discover sections', () => {
  it('Given the bundled manifest, When sections are declared, Then each one is capability-enabled and backed by a browse method', () => {
    // The app filters sections by declared capability, so a definition whose
    // capability is not declared true could never render.
    const provider = createMangaDexProvider({ fetchImpl: createFixtureFetch() });
    for (const section of MANGADEX_SECTION_DEFINITIONS) {
      expect(MANGADEX_MANIFEST.capabilities[section.capability]).toBe(true);
      expect(typeof provider[section.browse]).toBe('function');
    }
  });

  it('Given the sections, When read, Then they cover latest, trending, popular, recent and top rated', () => {
    expect(MANGADEX_SECTION_DEFINITIONS.map((section) => [section.id, section.title])).toEqual([
      ['latest', 'Latest updates'],
      ['trending', 'Trending this month'],
      ['popular', 'Popular'],
      ['recent', 'Recently added'],
      ['top-rated', 'Top rated'],
    ]);
  });
});
