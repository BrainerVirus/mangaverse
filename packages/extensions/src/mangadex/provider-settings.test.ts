import { describe, expect, it } from 'vitest';
import type { ProviderContext, RequestGate } from '@app/extensions-sdk';
import { createRequestGate } from '@app/extensions-sdk';
import type { ProviderSettingsValues } from '@app/shared';

import { MANGADEX_MANIFEST } from './manifest.js';
import { createMangaDexProvider } from './provider.js';
import { createFixtureFetch } from './testing/fixture-fetch.js';

const baseCtx: ProviderContext = { manifest: MANGADEX_MANIFEST, providerId: 'mangadex' };

function ctxWith(settings: ProviderSettingsValues): ProviderContext {
  return { ...baseCtx, settings };
}

function recordingProvider(gate?: RequestGate) {
  const urls: string[] = [];
  const fixture = createFixtureFetch();
  const provider = createMangaDexProvider({
    fetchImpl: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      return fixture(input, init);
    },
    ...(gate !== undefined ? { gate } : {}),
  });
  return {
    provider,
    urls,
    lastParams: () => new URL(urls[urls.length - 1] ?? 'https://invalid.test').searchParams,
  };
}

describe('MangaDex provider settings', () => {
  it('Given no settings, When searching, Then safe and suggestive ratings are requested', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.search!(baseCtx, { query: 'test' });
    expect(lastParams().getAll('contentRating[]')).toEqual(['safe', 'suggestive']);
    expect(lastParams().getAll('availableTranslatedLanguage[]')).toEqual([]);
  });

  it('Given preferred languages, When searching, Then they filter available translations', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.search!(ctxWith({ preferredLanguages: ['en', 'ja'] }), { query: 'test' });
    expect(lastParams().getAll('availableTranslatedLanguage[]')).toEqual(['en', 'ja']);
  });

  it('Given no settings, When reading a feed, Then English chapters are requested', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.getChapters!(baseCtx, 'manga-1' as never);
    expect(lastParams().getAll('translatedLanguage[]')).toEqual(['en']);
  });

  it('Given preferred languages, When reading a feed, Then every language is requested', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.getChapters!(ctxWith({ preferredLanguages: ['ja', 'ko'] }), 'manga-1' as never);
    expect(lastParams().getAll('translatedLanguage[]')).toEqual(['ja', 'ko']);
  });

  it('Given NSFW allowed, When searching, Then every MangaDex rating is requested', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.search!(ctxWith({ nsfwAllowed: true }), { query: 'test' });
    expect(lastParams().getAll('contentRating[]')).toEqual([
      'safe',
      'suggestive',
      'erotica',
      'pornographic',
    ]);
  });

  it('Given content rating filters, When searching, Then they override the NSFW flag', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.search!(
      ctxWith({ nsfwAllowed: true, contentRatingFilters: ['safe', 'explicit'] }),
      {
        query: 'test',
      },
    );
    expect(lastParams().getAll('contentRating[]')).toEqual(['safe', 'pornographic']);
  });

  it('Given tag filters, When searching, Then both tag lists are forwarded', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.search!(ctxWith({ includedTags: ['tag-a'], excludedTags: ['tag-b'] }), {
      query: 'test',
    });
    expect(lastParams().getAll('includedTags[]')).toEqual(['tag-a']);
    expect(lastParams().getAll('excludedTags[]')).toEqual(['tag-b']);
  });

  it('Given a default sort, When browsing latest and popular, Then each keeps its own order', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.browseLatest!(ctxWith({ defaultSort: 'popular' }), { page: 1 });
    expect(lastParams().get('order[latestUploadedChapter]')).toBe('desc');
    expect(lastParams().get('order[followedCount]')).toBeNull();
    await provider.browsePopular!(ctxWith({ defaultSort: 'latest' }), { page: 1 });
    expect(lastParams().get('order[followedCount]')).toBe('desc');
    expect(lastParams().get('order[latestUploadedChapter]')).toBeNull();
  });

  it('Given trending, recent and top-rated browse, Then each sends its own order', async () => {
    const { provider, lastParams } = recordingProvider();

    await provider.browseTrending!(baseCtx, { page: 1, limit: 6 });
    expect(lastParams().get('order[followedCount]')).toBe('desc');
    const since = lastParams().get('createdAtSince');
    expect(since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    const ageMs = Date.now() - Date.parse(since!);
    expect(ageMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);

    await provider.browseRecent!(baseCtx, { page: 1, limit: 6 });
    expect(lastParams().get('order[createdAt]')).toBe('desc');

    await provider.browseTopRated!(baseCtx, { page: 1, limit: 6 });
    expect(lastParams().get('order[rating]')).toBe('desc');
  });

  it('Given a large catalog, When browsing the last full window, Then pagination stops before 10000', async () => {
    const entity = { id: 'x', attributes: { title: { en: 'Title' } } };
    const collection = (total: number) =>
      JSON.stringify({
        result: 'ok',
        response: 'collection',
        data: Array.from({ length: 24 }, (_, index) => ({
          ...entity,
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        })),
        total,
      });
    const provider = createMangaDexProvider({
      fetchImpl: async () => new Response(collection(95_000)),
    });
    // Page 416 → offset 9960; the next page would ask for 9984+24 = 10008 > 10000.
    const lastFullWindow = await provider.browsePopular!(baseCtx, { page: 416 });
    expect(lastFullWindow.hasMore).toBe(false);
    // Page 415 → offset 9936; the next page (9960+24) is still inside the window.
    const stillMore = await provider.browsePopular!(baseCtx, { page: 415 });
    expect(stillMore.hasMore).toBe(true);
  });

  it('Given a default sort, When searching, Then search ordering follows it', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.search!(ctxWith({ defaultSort: 'popular' }), { query: 'test' });
    expect(lastParams().get('order[followedCount]')).toBe('desc');
    expect(lastParams().get('order[latestUploadedChapter]')).toBeNull();
  });

  it('Given a rate limit override of zero, When a request starts, Then it is rejected before fetching', async () => {
    const gate = createRequestGate({ defaultRequestsPerMinute: 40 });
    const { provider, urls } = recordingProvider(gate);
    await expect(
      provider.search!(ctxWith({ rateLimitOverrideRpm: 0 }), { query: 'test' }),
    ).rejects.toMatchObject({ code: 'extensions.sdk.ratelimit.blocked' });
    expect(urls).toEqual([]);
  });

  it('Given a rate limit override, When it is lower than the default, Then the gate applies it', async () => {
    let nowMs = 0;
    const delays: number[] = [];
    const gate = createRequestGate({
      defaultRequestsPerMinute: 40,
      now: () => nowMs,
      sleep: async (delayMs) => {
        delays.push(delayMs);
        nowMs += delayMs;
      },
    });
    const { provider, urls } = recordingProvider(gate);
    const ctx = ctxWith({ rateLimitOverrideRpm: 2 });

    await provider.search!(ctx, { query: 'first' });
    await provider.search!(ctx, { query: 'second' });
    await provider.search!(ctx, { query: 'third' });

    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThan(0);
    expect(urls).toHaveLength(3);
  });
});
