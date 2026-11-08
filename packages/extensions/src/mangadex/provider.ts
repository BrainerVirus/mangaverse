import type {
  ProviderContext,
  ProviderContract,
  ProviderSearchInput,
  ProviderSearchResult,
  RequestGate,
} from '@app/extensions-sdk';
import {
  createProviderRequestClient,
  defineProvider,
  redactUrlForErrorDetails,
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
/** MangaDex refuses any `/manga` request whose `offset + limit` exceeds 10000. */
const MAX_RESULT_WINDOW = 10_000;
/** Trending means the most-followed titles created in the last month. */
const TRENDING_WINDOW_DAYS = 30;
/** MangaDex's approximate documented ceiling is 5 requests/second. */
const MANGADEX_MAX_REQUESTS_PER_SECOND = 5;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  // MangaDex accepts `YYYY-MM-DDTHH:mm:ss`; milliseconds or a Z suffix are a 400.
  return date.toISOString().slice(0, 19);
}

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

/** Sort names the provider setting exposes, mapped to MangaDex's order parameter. */
const BROWSE_ORDER: Readonly<Record<string, string>> = {
  latest: 'order[latestUploadedChapter]',
  popular: 'order[followedCount]',
};

/** The user's default sort applies to search; browse sections keep their identity. */
function searchOrder(settings: ProviderSettingsValues): string | undefined {
  const sort = settings.defaultSort;
  return sort === undefined ? undefined : BROWSE_ORDER[sort];
}

/**
 * Whether another page of `limit` items exists after `offset`. Two independent
 * stops: the source's own `total`, and MangaDex's 10000-result window, so the
 * last page never asks for `offset + limit > 10000` and turns into an HTTP 400.
 */
function hasMorePages(
  total: number | undefined,
  offset: number,
  itemsLength: number,
  limit: number,
): boolean {
  if (itemsLength < limit) return false;
  const nextOffset = offset + limit;
  if (nextOffset + limit > MAX_RESULT_WINDOW) return false;
  return total === undefined ? true : nextOffset < total;
}

export interface CreateMangaDexProviderOptions {
  /** The injected transport: main-process IPC on desktop, the page's fetch on web. */
  readonly fetchImpl: typeof globalThis.fetch;
  /** Per-provider rate gate shared across every contract this app resolves. */
  readonly gate?: RequestGate;
  readonly timeoutMs?: number;
  readonly apiBaseUrl?: string;
}

export function createMangaDexProvider(options: CreateMangaDexProviderOptions): ProviderContract {
  const apiBase = options.apiBaseUrl ?? MANGADEX_API_BASE;
  const client = createProviderRequestClient({
    fetchImpl: options.fetchImpl,
    ...(options.gate !== undefined ? { gate: options.gate } : {}),
    defaultTimeoutMs: options.timeoutMs ?? 30_000,
  });

  const requestJson = async (ctx: ProviderContext, url: string): Promise<unknown> => {
    const response = await client.request({
      url,
      ...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
      ...(ctx.timeoutMs !== undefined ? { timeoutMs: ctx.timeoutMs } : {}),
      ...(ctx.maxGateWaitMs !== undefined ? { maxGateWaitMs: ctx.maxGateWaitMs } : {}),
      maxRequestsPerSecond: MANGADEX_MAX_REQUESTS_PER_SECOND,
      ...(ctx.settings?.rateLimitOverrideRpm !== undefined
        ? { requestsPerMinute: ctx.settings.rateLimitOverrideRpm }
        : {}),
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
    const order = searchOrder(settingsOf(ctx));
    if (order !== undefined) {
      params.set(order, 'desc');
    }
    const url = `${apiBase}/manga?${params.toString()}`;
    const endpoint = '/manga';
    const collection = parseCollectionResponse(await requestJson(ctx, url), endpoint);
    const offset = Number(params.get('offset') ?? '0');
    const items = collection.entities.map(toSearchItem);
    return {
      items,
      hasMore: hasMorePages(collection.total, offset, items.length, Number(params.get('limit'))),
    };
  };

  const browseOrdered = async (
    ctx: ProviderContext,
    page: number | undefined,
    order: string,
    limit: number | undefined,
    extraParams?: Readonly<Record<string, string>>,
  ): Promise<ProviderSearchResult> => {
    const settings = settingsOf(ctx);
    const params = collectionParams(
      {
        query: '',
        ...(page !== undefined ? { page } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
      settings,
    );
    for (const [name, value] of Object.entries(extraParams ?? {})) params.set(name, value);
    params.set(order, 'desc');
    const url = `${apiBase}/manga?${params.toString()}`;
    const collection = parseCollectionResponse(await requestJson(ctx, url), '/manga');
    const offset = Number(params.get('offset') ?? '0');
    const items = collection.entities.map(toSearchItem);
    return {
      items,
      hasMore: hasMorePages(collection.total, offset, items.length, Number(params.get('limit'))),
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
    browseLatest: (ctx, input) =>
      browseOrdered(ctx, input.page, 'order[latestUploadedChapter]', input.limit),
    browseTrending: (ctx, input) =>
      browseOrdered(ctx, input.page, 'order[followedCount]', input.limit, {
        createdAtSince: isoDaysAgo(TRENDING_WINDOW_DAYS),
      }),
    browsePopular: (ctx, input) =>
      browseOrdered(ctx, input.page, 'order[followedCount]', input.limit),
    browseRecent: (ctx, input) => browseOrdered(ctx, input.page, 'order[createdAt]', input.limit),
    browseTopRated: (ctx, input) => browseOrdered(ctx, input.page, 'order[rating]', input.limit),
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
