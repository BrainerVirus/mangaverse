import type { AppDrizzleDb } from '@app/db';
import {
  getCacheEntryById,
  listCacheEntriesForManga,
  touchCacheEntry,
  upsertCacheEntry,
} from '@app/db';
import type { PlatformAdapter } from '@app/platform';
import type { ChapterId, MangaId, ProviderId } from '@app/shared';

import {
  buildPageBlobKey,
  buildPageCacheEntryId,
  CACHE_RETENTION_READ,
  PAGE_CACHE_KIND,
} from './constants.js';
import { withBlobWrite } from './blob-writes.js';

export interface PageCacheLookupInput {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly chapterId: ChapterId | string;
  readonly pageIndex: number;
  readonly remoteUrl: string;
}

export interface PageCacheStoreResult {
  readonly objectUrl: string;
  readonly fromCache: boolean;
  /** Size of the stored page blob in bytes. */
  readonly byteSize: number;
}

const inFlightPageFetches = new Map<
  string,
  Promise<{ data: ArrayBuffer; mimeType: string } | undefined>
>();

async function createObjectUrlFromBlob(
  adapter: PlatformAdapter,
  data: ArrayBuffer,
  mimeType: string,
): Promise<string | undefined> {
  const result = await adapter.blobStorage.createObjectUrl(data, mimeType);
  return result.ok ? result.value : undefined;
}

async function fetchRemotePage(
  adapter: PlatformAdapter,
  remoteUrl: string,
): Promise<{ data: ArrayBuffer; mimeType: string } | undefined> {
  const result = await adapter.network.fetchBytes(remoteUrl);
  if (!result.ok || result.value === undefined) {
    return undefined;
  }
  return result.value;
}

/**
 * Shared byte fetch for a page. Prefetch and the visible page component can ask
 * for the same page; awaiting one promise keeps that from becoming two network
 * requests. Each caller still owns its own object URL.
 */
async function fetchPageBytes(
  input: PageCacheLookupInput,
): Promise<{ data: ArrayBuffer; mimeType: string } | undefined> {
  const fetchKey = buildPageBlobKey(
    String(input.providerId),
    String(input.mangaId),
    String(input.chapterId),
    input.pageIndex,
  );
  const existingFetch = inFlightPageFetches.get(fetchKey);
  if (existingFetch !== undefined) {
    return existingFetch;
  }

  const fetchPromise = fetchRemotePage(input.adapter, input.remoteUrl);
  inFlightPageFetches.set(fetchKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightPageFetches.delete(fetchKey);
  }
}

export async function getCachedPageObjectUrl(
  input: PageCacheLookupInput,
): Promise<PageCacheStoreResult | undefined> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const chapterId = String(input.chapterId);
  const entryId = buildPageCacheEntryId(providerId, mangaId, chapterId, input.pageIndex);
  const entry = await getCacheEntryById(input.db, entryId);

  if (entry?.blobKey === undefined) {
    return undefined;
  }

  const blobResult = await input.adapter.blobStorage.get(entry.blobKey);
  if (!blobResult.ok || blobResult.value === undefined) {
    return undefined;
  }

  const objectUrl = await createObjectUrlFromBlob(
    input.adapter,
    blobResult.value.data,
    blobResult.value.mimeType,
  );
  if (objectUrl === undefined) {
    return undefined;
  }

  await touchCacheEntry(input.db, entry.id);
  return { objectUrl, fromCache: true, byteSize: blobResult.value.data.byteLength };
}

async function storePageBlob(
  input: PageCacheLookupInput & {
    readonly data: ArrayBuffer;
    readonly mimeType: string;
    readonly retention?: typeof CACHE_RETENTION_READ | 'normal';
  },
): Promise<number | undefined> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const chapterId = String(input.chapterId);
  const blobKey = buildPageBlobKey(providerId, mangaId, chapterId, input.pageIndex);
  const entryId = buildPageCacheEntryId(providerId, mangaId, chapterId, input.pageIndex);

  const stored = await withBlobWrite(blobKey, async () => {
    const putResult = await input.adapter.blobStorage.put(blobKey, input.data, input.mimeType);
    if (!putResult.ok) {
      return false;
    }

    await upsertCacheEntry(input.db, {
      id: entryId,
      providerId,
      mangaId,
      chapterId,
      cacheKind: PAGE_CACHE_KIND,
      sourceUrl: input.remoteUrl,
      mimeType: input.mimeType,
      byteSize: input.data.byteLength,
      blobKey,
      metadata: {
        pageIndex: input.pageIndex,
        retention: input.retention ?? 'normal',
      },
    });
    return true;
  });
  if (!stored) {
    return undefined;
  }

  return input.data.byteLength;
}

export async function storePageInCache(
  input: PageCacheLookupInput & {
    readonly data: ArrayBuffer;
    readonly mimeType: string;
    readonly retention?: typeof CACHE_RETENTION_READ | 'normal';
  },
): Promise<PageCacheStoreResult | undefined> {
  const byteSize = await storePageBlob(input);
  if (byteSize === undefined) {
    return undefined;
  }

  const objectUrl = await createObjectUrlFromBlob(input.adapter, input.data, input.mimeType);
  if (objectUrl === undefined) {
    return undefined;
  }

  return { objectUrl, fromCache: false, byteSize };
}

/**
 * Ensures a page is in the blob cache without creating an object URL. Prefetch
 * has no component to own and revoke a URL, so it only writes bytes + metadata;
 * the visible page component resolves its own URL when it mounts.
 */
async function prefetchPageToCache(
  input: PageCacheLookupInput,
  signal?: AbortSignal,
): Promise<{ readonly fromCache: boolean; readonly byteSize: number } | undefined> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const chapterId = String(input.chapterId);
  const entryId = buildPageCacheEntryId(providerId, mangaId, chapterId, input.pageIndex);
  const entry = await getCacheEntryById(input.db, entryId);
  if (entry?.blobKey !== undefined) {
    return { fromCache: true, byteSize: entry.byteSize };
  }

  const remote = await fetchPageBytes(input);
  if (remote === undefined || signal?.aborted === true) {
    return undefined;
  }

  const byteSize = await storePageBlob({ ...input, ...remote });
  return byteSize === undefined ? undefined : { fromCache: false, byteSize };
}

export async function resolvePageObjectUrl(
  input: PageCacheLookupInput & {
    readonly retention?: typeof CACHE_RETENTION_READ | 'normal';
    readonly refresh?: boolean;
  },
): Promise<PageCacheStoreResult | undefined> {
  const cached = input.refresh ? undefined : await getCachedPageObjectUrl(input);
  if (cached !== undefined) {
    return cached;
  }

  const remote = await fetchPageBytes(input);
  if (remote === undefined) {
    return undefined;
  }

  const stored = await storePageInCache({ ...input, ...remote });
  return stored;
}

/** Returns a local blob URL for a page, or undefined while loading / on cache miss. Never returns remote URLs. */
export async function resolvePageUrl(input: PageCacheLookupInput): Promise<string | undefined> {
  const result = await resolvePageObjectUrl(input);
  return result?.objectUrl;
}

export async function markChapterPagesAsRead(
  db: AppDrizzleDb,
  input: {
    readonly providerId: string;
    readonly mangaId: string;
    readonly chapterId: string;
  },
): Promise<void> {
  const entries = await listCacheEntriesForManga(db, input.providerId, input.mangaId);
  const chapterEntries = entries.filter(
    (entry) =>
      entry.cacheKind === PAGE_CACHE_KIND &&
      entry.chapterId === input.chapterId &&
      entry.metadata?.retention !== CACHE_RETENTION_READ,
  );

  for (const entry of chapterEntries) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- one row per iteration against the browser-SQLite runtime; parallel upserts would only contend for the same write lock
    await upsertCacheEntry(db, {
      id: entry.id,
      providerId: entry.providerId,
      mangaId: entry.mangaId,
      ...(entry.chapterId !== undefined ? { chapterId: entry.chapterId } : {}),
      cacheKind: entry.cacheKind,
      ...(entry.sourceUrl !== undefined ? { sourceUrl: entry.sourceUrl } : {}),
      ...(entry.mimeType !== undefined ? { mimeType: entry.mimeType } : {}),
      byteSize: entry.byteSize,
      ...(entry.blobKey !== undefined ? { blobKey: entry.blobKey } : {}),
      metadata: { ...(entry.metadata ?? {}), retention: CACHE_RETENTION_READ },
    });
  }
}

/**
 * Pages fetched at a time. A chapter holds hundreds of them and every fetch is a
 * full image decoded into memory, so an unbounded `Promise.all` fans out one
 * request per page the moment the reader opens.
 */
const PREFETCH_CONCURRENCY = 4;

export interface PrefetchPage {
  readonly pageIndex: number;
  readonly remoteUrl: string;
}

export interface PrefetchQueueOutcome {
  /** Bytes downloaded by this run; cache hits are free. */
  readonly downloadedBytes: number;
}

/**
 * Runs `resolvePage` over `pages` with `PREFETCH_CONCURRENCY` workers. Cached
 * pages cost nothing; once the freshly downloaded bytes reach `budgetBytes`
 * no further pages are issued. `budgetBytes` 0 means unlimited. Fetches
 * already in flight when the budget is reached are not cancelled, so at most
 * `PREFETCH_CONCURRENCY` (4) pages can overshoot the budget.
 */
export async function runPrefetchQueue(input: {
  readonly pages: readonly PrefetchPage[];
  readonly budgetBytes: number;
  readonly signal?: AbortSignal;
  readonly resolvePage: (
    page: PrefetchPage,
  ) => Promise<{ readonly fromCache: boolean; readonly byteSize: number } | undefined>;
}): Promise<PrefetchQueueOutcome> {
  const queue = [...input.pages];
  let downloadedBytes = 0;
  const budgetReached = (): boolean =>
    input.budgetBytes > 0 && downloadedBytes >= input.budgetBytes;

  const worker = async (): Promise<void> => {
    for (let page = queue.shift(); page !== undefined; page = queue.shift()) {
      if (budgetReached() || input.signal?.aborted === true) return;
      // oxlint-disable-next-line eslint/no-await-in-loop
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- the 4-at-a-time bound from #71 (ruling mvd745t3): this worker pool IS the prefetch limiter
      const result = await input.resolvePage(page);
      if (result !== undefined && !result.fromCache) {
        downloadedBytes += result.byteSize;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, worker));
  return { downloadedBytes };
}

export async function prefetchChapterPages(
  input: Omit<PageCacheLookupInput, 'pageIndex' | 'remoteUrl'> & {
    readonly pages: readonly PrefetchPage[];
    readonly retention?: typeof CACHE_RETENTION_READ | 'normal';
    /** Maximum newly downloaded bytes; 0 or omitted means unlimited. */
    readonly budgetBytes?: number;
    readonly signal?: AbortSignal;
  },
): Promise<void> {
  // One chapter-scoped read beats one existence check per page on every reader
  // mount and settings edit.
  const cachedIndexes = new Set(
    await listCachedChapterPageIndexes(input.db, {
      providerId: String(input.providerId),
      mangaId: String(input.mangaId),
      chapterId: String(input.chapterId),
    }),
  );

  await runPrefetchQueue({
    pages: input.pages,
    budgetBytes: input.budgetBytes ?? 0,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
    resolvePage: (page) =>
      cachedIndexes.has(page.pageIndex)
        ? Promise.resolve({ fromCache: true, byteSize: 0 })
        : prefetchPageToCache(
            {
              db: input.db,
              adapter: input.adapter,
              providerId: input.providerId,
              mangaId: input.mangaId,
              chapterId: input.chapterId,
              pageIndex: page.pageIndex,
              remoteUrl: page.remoteUrl,
              ...(input.retention !== undefined ? { retention: input.retention } : {}),
            },
            input.signal,
          ),
  });
}

/** Page indexes of a chapter that have a cache entry, ascending. */
export async function listCachedChapterPageIndexes(
  db: AppDrizzleDb,
  input: {
    readonly providerId: string;
    readonly mangaId: string;
    readonly chapterId: string;
  },
): Promise<number[]> {
  const entries = await listCacheEntriesForManga(db, input.providerId, input.mangaId);
  const indexes = new Set<number>();

  for (const entry of entries) {
    if (entry.cacheKind !== PAGE_CACHE_KIND || entry.chapterId !== input.chapterId) continue;
    const pageIndex = entry.metadata?.pageIndex;
    if (typeof pageIndex === 'number') indexes.add(pageIndex);
  }

  return [...indexes].sort((left, right) => left - right);
}
