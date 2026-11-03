import { describe, expect, it } from 'vitest';

import { MANGADEX_MANIFEST } from './manifest.js';
import { createMangaDexProvider } from './provider.js';

/**
 * Opt-in live smoke against the real MangaDex API. Skipped unless
 * MANGADEX_LIVE=1, so CI never depends on the network or the site's uptime.
 */
const live = process.env['MANGADEX_LIVE'] === '1';
const describeLive = live ? describe : describe.skip;

describeLive('MangaDex live smoke', () => {
  it('Given the real API, When searching, Then results, chapters and pages resolve', async () => {
    const provider = createMangaDexProvider({
      // oxlint-disable-next-line no-restricted-properties -- this opt-in live smoke exists to hit the real API; every other provider path injects its transport
      fetchImpl: globalThis.fetch.bind(globalThis),
      timeoutMs: 15_000,
    });
    const ctx = { manifest: MANGADEX_MANIFEST, providerId: 'mangadex' };

    const search = await provider.search!(ctx, { query: 'berserk', limit: 5 });
    expect(search.items.length).toBeGreaterThan(0);
    const first = search.items[0]!;

    const details = await provider.getDetails!(ctx, first.providerMangaId);
    expect(details.titles.length).toBeGreaterThan(0);

    const chapters = await provider.getChapters!(ctx, first.providerMangaId);
    expect(chapters.length).toBeGreaterThan(0);
    const firstChapter = chapters[0]!;

    const pages = await provider.getPages!(ctx, first.providerMangaId, firstChapter.id);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.imageUrl).toMatch(/^https:\/\/.+\/(data|data-saver)\/.+\/.+$/);
    expect(pages.map((page) => page.index)).toEqual(pages.map((_page, index) => index));
  }, 60_000);
});
