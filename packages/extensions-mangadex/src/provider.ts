import type {
  ProviderContext,
  ProviderContract,
  ProviderSearchInput,
  ProviderSearchResult,
} from '@app/extensions-sdk';
import {
  createProviderRequestClient,
  defineProvider,
  redactUrlForErrorDetails,
} from '@app/extensions-sdk';
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

  const collectionParams = (input: ProviderSearchInput): URLSearchParams => {
    const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const params = new URLSearchParams();
    params.append('includes[]', 'cover_art');
    params.append('contentRating[]', 'safe');
    params.append('contentRating[]', 'suggestive');
    params.set('limit', String(limit));
    params.set('offset', String((page - 1) * limit));
    return params;
  };

  const searchCollection = async (
    ctx: ProviderContext,
    input: ProviderSearchInput,
  ): Promise<ProviderSearchResult> => {
    const params = collectionParams(input);
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
    const params = collectionParams({ query: '', ...(page !== undefined ? { page } : {}) });
    params.set(order, 'desc');
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
    for (let page = 0; page < FEED_MAX_PAGES; page += 1) {
      const params = new URLSearchParams();
      params.set('limit', String(FEED_PAGE_LIMIT));
      params.set('offset', String(page * FEED_PAGE_LIMIT));
      params.set('order[chapter]', 'asc');
      params.append('translatedLanguage[]', 'en');
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
