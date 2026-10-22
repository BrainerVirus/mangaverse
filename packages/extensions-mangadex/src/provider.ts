import type {
  ProviderContext,
  ProviderContract,
  ProviderSearchInput,
  ProviderSearchResult,
} from '@app/extensions-sdk';
import {
  createProviderRequestClient,
  createRateLimiter,
  defineProvider,
  redactUrlForErrorDetails,
  type RateLimiter,
} from '@app/extensions-sdk';
import type { ContentRating, ProviderSettingsValues } from '@app/shared';
import { createAppError } from '@app/shared';

import { MANGADEX_MANIFEST } from './manifest.js';
import { toChapters, toDetails, toPages, toSearchItem } from './mapping.js';
import {
  parseAtHomeResponse,
  parseCollectionResponse,
  parseDetailResponse,
  parseFeedResponse,
} from './schemas.js';

export const MANGADEX_API_BASE = 'https://api.mangadex.org';
const FEED_PAGE_LIMIT = 100;
/** Safety cap so a pathological feed cannot loop forever. */
const FEED_MAX_PAGES = 25;
/** Matches the manifest's declared ops.officialApi rate limit. */
const DEFAULT_RATE_LIMIT_RPM = 40;

const DEFAULT_LANGUAGES: readonly string[] = ['en'];
/** MangaDex ratings requested unless the user opts into mature content. */
const DEFAULT_CONTENT_RATINGS: readonly string[] = ['safe', 'suggestive'];
const NSFW_CONTENT_RATINGS: readonly string[] = ['safe', 'suggestive', 'erotica', 'pornographic'];
const RATING_PARAM: Readonly<Record<ContentRating, string>> = {
  safe: 'safe',
  suggestive: 'suggestive',
  mature: 'erotica',
  explicit: 'pornographic',
  unknown: '',
};
/** Settings sort names the browse methods understand. */
const BROWSE_ORDER: Readonly<Record<string, string>> = {
  latest: 'order[latestUploadedChapter]',
  popular: 'order[followedCount]',
};

function settingsOf(ctx: ProviderContext): ProviderSettingsValues {
  return ctx.settings ?? {};
}

function preferredLanguages(settings: ProviderSettingsValues): readonly string[] {
  const configured = settings.preferredLanguages?.filter((value) => value.trim().length > 0) ?? [];
  return configured.length > 0 ? configured : DEFAULT_LANGUAGES;
}

function contentRatings(settings: ProviderSettingsValues): readonly string[] {
  const filters = settings.contentRatingFilters ?? [];
  if (filters.length > 0) {
    const mapped = filters.map((rating) => RATING_PARAM[rating]).filter((value) => value !== '');
    return [...new Set(mapped)];
  }
  return settings.nsfwAllowed === true ? NSFW_CONTENT_RATINGS : DEFAULT_CONTENT_RATINGS;
}

function browseOrder(settings: ProviderSettingsValues, fallback: string): string {
  const sort = settings.defaultSort;
  const order = sort === undefined ? undefined : BROWSE_ORDER[sort];
  return order ?? fallback;
}

// Module-level: the web app resolves a fresh contract per call, so a limiter
// owned by the instance would reset the budget on every request.
const limiters = new Map<number, RateLimiter>();

function consumeRateLimit(ctx: ProviderContext): void {
  const rpm = ctx.settings?.rateLimitOverrideRpm ?? DEFAULT_RATE_LIMIT_RPM;
  let limiter = limiters.get(rpm);
  if (limiter === undefined) {
    limiter = createRateLimiter({ requestsPerMinute: rpm });
    limiters.set(rpm, limiter);
  }
  const allowed = limiter.tryConsume('mangadex');
  if (!allowed.ok) throw allowed.error;
}

export interface CreateMangaDexProviderOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly apiBaseUrl?: string;
}

export function createMangaDexProvider(
  options: CreateMangaDexProviderOptions = {},
): ProviderContract {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.apiBaseUrl ?? MANGADEX_API_BASE;
  const client = createProviderRequestClient({
    fetchImpl,
    defaultTimeoutMs: options.timeoutMs ?? 30_000,
  });

  const requestJson = async (ctx: ProviderContext, url: string): Promise<unknown> => {
    consumeRateLimit(ctx);
    const response = await client.request({
      url,
      ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
    });
    if (!response.ok) {
      throw response.error;
    }
    try {
      return JSON.parse(response.value.bodyText);
    } catch {
      throw createAppError({
        code: 'extensions.mangadex.payload_invalid',
        message: 'MangaDex response was not valid JSON.',
        details: { endpoint: redactUrlForErrorDetails(url) },
      });
    }
  };

  const collectionParams = (
    input: ProviderSearchInput,
    settings: ProviderSettingsValues,
  ): URLSearchParams => {
    const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const params = new URLSearchParams();
    params.append('includes[]', 'cover_art');
    for (const rating of contentRatings(settings)) {
      params.append('contentRating[]', rating);
    }
    // Only an explicit preference filters collections; the default keeps every
    // language so search and browse do not silently lose catalog entries.
    for (const language of settings.preferredLanguages ?? []) {
      params.append('availableTranslatedLanguage[]', language);
    }
    for (const tag of settings.includedTags ?? []) {
      params.append('includedTags[]', tag);
    }
    for (const tag of settings.excludedTags ?? []) {
      params.append('excludedTags[]', tag);
    }
    params.set('limit', String(limit));
    params.set('offset', String((page - 1) * limit));
    return params;
  };

  const searchCollection = async (
    ctx: ProviderContext,
    input: ProviderSearchInput,
  ): Promise<ProviderSearchResult> => {
    const params = collectionParams(input, settingsOf(ctx));
    const trimmed = input.query.trim();
    if (trimmed.length > 0) {
      params.set('title', trimmed);
    }
    const url = `${apiBase}/manga?${params.toString()}`;
    const endpoint = '/manga';
    const collection = parseCollectionResponse(await requestJson(ctx, url), endpoint);
    const offset = Number(params.get('offset') ?? '0');
    const items = collection.entities.map(toSearchItem);
    return {
      items,
      hasMore:
        collection.total !== undefined
          ? offset + items.length < collection.total
          : items.length === Number(params.get('limit')),
    };
  };

  const browseOrdered = async (
    ctx: ProviderContext,
    page: number | undefined,
    order: string,
  ): Promise<ProviderSearchResult> => {
    const settings = settingsOf(ctx);
    const params = collectionParams(
      { query: '', ...(page !== undefined ? { page } : {}) },
      settings,
    );
    params.set(browseOrder(settings, order), 'desc');
    const url = `${apiBase}/manga?${params.toString()}`;
    const collection = parseCollectionResponse(await requestJson(ctx, url), '/manga');
    const offset = Number(params.get('offset') ?? '0');
    const items = collection.entities.map(toSearchItem);
    return {
      items,
      hasMore:
        collection.total !== undefined
          ? offset + items.length < collection.total
          : items.length === Number(params.get('limit')),
    };
  };

  const fetchChapterFeed = async (ctx: ProviderContext, providerMangaId: string) => {
    const chapters = [];
    const languages = preferredLanguages(settingsOf(ctx));
    for (let page = 0; page < FEED_MAX_PAGES; page += 1) {
      const params = new URLSearchParams();
      params.set('limit', String(FEED_PAGE_LIMIT));
      params.set('offset', String(page * FEED_PAGE_LIMIT));
      params.set('order[chapter]', 'asc');
      for (const language of languages) {
        params.append('translatedLanguage[]', language);
      }
      const url = `${apiBase}/manga/${providerMangaId}/feed?${params.toString()}`;
      const feed = parseFeedResponse(await requestJson(ctx, url), '/manga/{id}/feed');
      chapters.push(...feed.chapters);
      if (feed.chapters.length < FEED_PAGE_LIMIT) break;
    }
    return toChapters(chapters);
  };

  const provider: ProviderContract = {
    manifest: MANGADEX_MANIFEST,
    search: (ctx, input) => searchCollection(ctx, input),
    browseLatest: (ctx, input) => browseOrdered(ctx, input.page, 'order[latestUploadedChapter]'),
    browsePopular: (ctx, input) => browseOrdered(ctx, input.page, 'order[followedCount]'),
    getDetails: async (ctx, mangaId) => {
      const params = new URLSearchParams();
      params.append('includes[]', 'cover_art');
      params.append('includes[]', 'author');
      params.append('includes[]', 'artist');
      const url = `${apiBase}/manga/${String(mangaId)}?${params.toString()}`;
      return toDetails(parseDetailResponse(await requestJson(ctx, url), '/manga/{id}'));
    },
    getChapters: (ctx, mangaId) => fetchChapterFeed(ctx, String(mangaId)),
    getPages: async (ctx, _mangaId, chapterId) => {
      const url = `${apiBase}/at-home/server/${chapterId}`;
      const atHome = parseAtHomeResponse(await requestJson(ctx, url), '/at-home/server/{id}');
      return toPages(atHome, 'data-saver');
    },
  };

  return defineProvider(provider);
}
