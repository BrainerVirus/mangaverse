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

  it('Given a default sort, When browsing, Then the matching order parameter wins', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.browseLatest!(ctxWith({ defaultSort: 'popular' }), { page: 1 });
    expect(lastParams().get('order[followedCount]')).toBe('desc');
    expect(lastParams().get('order[latestUploadedChapter]')).toBeNull();
  });

  it('Given a default sort, When searching, Then search ordering is untouched', async () => {
    const { provider, lastParams } = recordingProvider();
    await provider.search!(ctxWith({ defaultSort: 'popular' }), { query: 'test' });
    expect([...lastParams().keys()].filter((key) => key.startsWith('order['))).toEqual([]);
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
