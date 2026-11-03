import type { AppDrizzleDb } from '@app/db';
import {
  deleteCacheEntries,
  getCacheEntryById,
  listCacheEntriesByKind,
  listCacheEntriesForManga,
  touchCacheEntry,
  upsertCacheEntry,
  type CacheEntryRecord,
} from '@app/db';
import type { PlatformAdapter } from '@app/platform';
import type { AppError, ChapterId, MangaId, ProviderId } from '@app/shared';

import {
  buildPageBlobKey,
  buildPageCacheEntryId,
  CACHE_RETENTION_DOWNLOAD,
  CACHE_RETENTION_READ,
  PAGE_CACHE_KIND,
  type CacheRetention,
} from './constants.js';
import { isBlobWriteInFlight, withBlobWrite } from './blob-writes.js';
import { deleteBlobKeys } from './blob-deletes.js';

/** Why one page could not be stored: a full disk is distinct from a network failure. */
export type PageCacheFailureCode = 'storage-full' | 'storage' | 'network' | 'unknown';

export interface PageCacheFailure {
  readonly code: PageCacheFailureCode;
  readonly message: string;
}

export type PrefetchPageOutcome =
  | { readonly status: 'cached'; readonly byteSize: number }
  | { readonly status: 'fetched'; readonly byteSize: number }
  | { readonly status: 'failed'; readonly failure: PageCacheFailure };

function failureFromError(
  error: AppError | undefined,
  fallback: PageCacheFailureCode,
): PageCacheFailure {
  if (error === undefined) {
    return {
      code: fallback,
      message:
        fallback === 'network'
          ? 'The page could not be downloaded.'
          : 'The page could not be stored.',
    };
  }
  if (error.code === 'platform.storage-full' || error.code === 'storage-full') {
    return { code: 'storage-full', message: error.message };
  }
  if (error.code.startsWith('platform.') || error.code.startsWith('blob.')) {
    return { code: 'storage', message: error.message };
  }
  return { code: fallback, message: error.message };
}

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

const inFlightPageFetches = new Map<string, Promise<RemotePageResult>>();

/** In-flight main-side stores; they return a URL and size, never bytes. */
const inFlightPageStores = new Map<string, Promise<MainStoreResult>>();

type MainStoreResult =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'stored'; readonly objectUrl: string; readonly byteSize: number }
  | { readonly kind: 'failed'; readonly failure: PageCacheFailure };

type RemotePageResult =
  | { readonly kind: 'fetched'; readonly data: ArrayBuffer; readonly mimeType: string }
  | { readonly kind: 'failed'; readonly failure: PageCacheFailure };

async function createObjectUrlFromBlob(
  adapter: PlatformAdapter,
  data: ArrayBuffer,
  mimeType: string,
): Promise<string | undefined> {
  const result = await adapter.blobStorage.createObjectUrl(data, mimeType);
  return result.ok ? result.value : undefined;
}

/**
 * The store's own URL for a page, when it serves pages by URL (desktop: `page://`). `null`
 * means this store has none, so the caller reads the bytes and makes an object URL.
 */
async function resolveStoredPageUrl(
  adapter: PlatformAdapter,
  blobKey: string,
): Promise<string | undefined | null> {
  if (adapter.blobStorage.resolveUrl === undefined) return null;
  const result = await adapter.blobStorage.resolveUrl(blobKey);
  return result.ok ? result.value : null;
}

/**
 * Desktop path: main fetches the image under the provider's allowlist and writes it
 * to the page store, so no page bytes enter this process. `unsupported` means the
 * adapter has no main store and the caller should fall back to fetching bytes.
 */
async function storeRemotePageInMain(
  input: PageCacheLookupInput & { readonly retention?: CacheRetention },
): Promise<MainStoreResult> {
  const store = input.adapter.providerNetwork.fetchAndStore;
  if (store === undefined) return { kind: 'unsupported' };

  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const chapterId = String(input.chapterId);
  const blobKey = buildPageBlobKey(providerId, mangaId, chapterId, input.pageIndex);
  const existing = inFlightPageStores.get(blobKey);
  if (existing !== undefined) return existing;

  const entryId = buildPageCacheEntryId(providerId, mangaId, chapterId, input.pageIndex);
  const promise = (async (): Promise<MainStoreResult> => {
    const result = await store({
      providerId,
      url: input.remoteUrl,
      key: blobKey,
    });
    if (!result.ok) {
      return { kind: 'failed', failure: failureFromError(result.error, 'storage') };
    }
    if (result.value === undefined) {
      return {
        kind: 'failed',
        failure: { code: 'storage', message: 'Main did not return a stored page.' },
      };
    }
    const stored = result.value;
    await withBlobWrite(blobKey, async () => {
      await upsertCacheEntry(input.db, {
        id: entryId,
        providerId,
        mangaId,
        chapterId,
        cacheKind: PAGE_CACHE_KIND,
        sourceUrl: input.remoteUrl,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        blobKey,
        metadata: {
          pageIndex: input.pageIndex,
          retention: input.retention ?? 'normal',
        },
      });
    });
    return { kind: 'stored', objectUrl: stored.url, byteSize: stored.byteSize };
  })();
  inFlightPageStores.set(blobKey, promise);
  try {
    return await promise;
  } finally {
    inFlightPageStores.delete(blobKey);
  }
}

async function fetchRemotePage(
  adapter: PlatformAdapter,
  providerId: string,
  remoteUrl: string,
): Promise<RemotePageResult> {
  // Web has no main process; refuse an undeclared host before the bytes leave
  // the page. Desktop leaves `isAllowedHost` absent because main enforces it.
  if (
    adapter.providerNetwork.isAllowedHost !== undefined &&
    !adapter.providerNetwork.isAllowedHost(providerId, remoteUrl)
  ) {
    return {
      kind: 'failed',
      failure: { code: 'network', message: 'This page host is not allowed by the provider.' },
    };
  }
  const result = await adapter.network.fetchBytes(remoteUrl);
  if (!result.ok) {
    return { kind: 'failed', failure: failureFromError(result.error, 'network') };
  }
  if (result.value === undefined) {
    return { kind: 'failed', failure: failureFromError(undefined, 'network') };
  }
  return { kind: 'fetched', data: result.value.data, mimeType: result.value.mimeType };
}

/**
 * Shared byte fetch for a page. Prefetch and the visible page component can ask
 * for the same page; awaiting one promise keeps that from becoming two network
 * requests. Each caller still owns its own object URL.
 */
async function fetchPageBytes(input: PageCacheLookupInput): Promise<RemotePageResult> {
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

  const fetchPromise = fetchRemotePage(input.adapter, String(input.providerId), input.remoteUrl);
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

  const storedUrl = await resolveStoredPageUrl(input.adapter, entry.blobKey);
  if (storedUrl === undefined) {
    return undefined;
  }
  if (storedUrl !== null) {
    await touchCacheEntry(input.db, entry.id);
    return { objectUrl: storedUrl, fromCache: true, byteSize: entry.byteSize };
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

type PageStoreWrite =
  | { readonly kind: 'stored'; readonly byteSize: number }
  | { readonly kind: 'failed'; readonly failure: PageCacheFailure };

async function storePageBlob(
  input: PageCacheLookupInput & {
    readonly data: ArrayBuffer;
    readonly mimeType: string;
    readonly retention?: CacheRetention;
  },
): Promise<PageStoreWrite> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const chapterId = String(input.chapterId);
  const blobKey = buildPageBlobKey(providerId, mangaId, chapterId, input.pageIndex);
  const entryId = buildPageCacheEntryId(providerId, mangaId, chapterId, input.pageIndex);

  const stored = await withBlobWrite(blobKey, async (): Promise<PageStoreWrite> => {
    const putResult = await input.adapter.blobStorage.put(blobKey, input.data, input.mimeType);
    if (!putResult.ok) {
      return { kind: 'failed', failure: failureFromError(putResult.error, 'storage') };
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
    return { kind: 'stored', byteSize: input.data.byteLength };
  });
  return stored;
}

export async function storePageInCache(
  input: PageCacheLookupInput & {
    readonly data: ArrayBuffer;
    readonly mimeType: string;
    readonly retention?: CacheRetention;
  },
): Promise<PageCacheStoreResult | undefined> {
  const write = await storePageBlob(input);
  if (write.kind === 'failed') {
    return undefined;
  }
  const byteSize = write.byteSize;

  const blobKey = buildPageBlobKey(
    String(input.providerId),
    String(input.mangaId),
    String(input.chapterId),
    input.pageIndex,
  );
  const storedUrl = await resolveStoredPageUrl(input.adapter, blobKey);
  if (storedUrl !== null) {
    return storedUrl === undefined
      ? undefined
      : { objectUrl: storedUrl, fromCache: false, byteSize };
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
  input: PageCacheLookupInput & { readonly retention?: CacheRetention },
  signal?: AbortSignal,
): Promise<PrefetchPageOutcome> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const chapterId = String(input.chapterId);
  const entryId = buildPageCacheEntryId(providerId, mangaId, chapterId, input.pageIndex);
  const entry = await getCacheEntryById(input.db, entryId);
  if (entry?.blobKey !== undefined) {
    return { status: 'cached', byteSize: entry.byteSize };
  }

  if (input.adapter.providerNetwork.fetchAndStore !== undefined) {
    const stored = await storeRemotePageInMain(input);
    if (stored.kind === 'unsupported') {
      return {
        status: 'failed',
        failure: { code: 'storage', message: 'The page store is unavailable.' },
      };
    }
    return stored.kind === 'stored'
      ? { status: 'fetched', byteSize: stored.byteSize }
      : { status: 'failed', failure: stored.failure };
  }

  const remote = await fetchPageBytes(input);
  if (signal?.aborted === true) {
    return {
      status: 'failed',
      failure: { code: 'unknown', message: 'The download was cancelled.' },
    };
  }
  if (remote.kind === 'failed') {
    return { status: 'failed', failure: remote.failure };
  }

  const write = await storePageBlob({ ...input, data: remote.data, mimeType: remote.mimeType });
  return write.kind === 'failed'
    ? { status: 'failed', failure: write.failure }
    : { status: 'fetched', byteSize: write.byteSize };
}

export async function resolvePageObjectUrl(
  input: PageCacheLookupInput & {
    readonly retention?: CacheRetention;
    readonly refresh?: boolean;
  },
): Promise<PageCacheStoreResult | undefined> {
  const cached = input.refresh ? undefined : await getCachedPageObjectUrl(input);
  if (cached !== undefined) {
    return cached;
  }

  // Desktop: main stores the page and returns only its URL and size. No bytes
  // reach this process, and a failure is final rather than a byte fallback.
  if (input.adapter.providerNetwork.fetchAndStore !== undefined) {
    const stored = await storeRemotePageInMain(input);
    return stored.kind === 'stored'
      ? { objectUrl: stored.objectUrl, fromCache: false, byteSize: stored.byteSize }
      : undefined;
  }

  const remote = await fetchPageBytes(input);
  if (remote.kind === 'failed') {
    return undefined;
  }

  const stored = await storePageInCache({ ...input, data: remote.data, mimeType: remote.mimeType });
  return stored;
}

/** Returns a local URL (object URL, or `page://` on desktop) for a page, or undefined while loading / on cache miss. Never returns remote URLs. */
export async function resolvePageUrl(input: PageCacheLookupInput): Promise<string | undefined> {
  const result = await resolvePageObjectUrl(input);
  return result?.objectUrl;
}

interface ChapterPageRef {
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
}

async function chapterPageEntries(
  db: AppDrizzleDb,
  input: ChapterPageRef,
): Promise<CacheEntryRecord[]> {
  const entries = await listCacheEntriesForManga(db, input.providerId, input.mangaId);
  return entries.filter(
    (entry) => entry.cacheKind === PAGE_CACHE_KIND && entry.chapterId === input.chapterId,
  );
}

/**
 * Reading a chapter never downgrades a download: the download retention is what
 * protects its pages from eviction, and `read` would hand them back to it.
 */
export async function markChapterPagesAsRead(
  db: AppDrizzleDb,
  input: ChapterPageRef,
): Promise<void> {
  const chapterEntries = (await chapterPageEntries(db, input)).filter(
    (entry) =>
      entry.metadata?.retention !== CACHE_RETENTION_READ &&
      entry.metadata?.retention !== CACHE_RETENTION_DOWNLOAD,
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
 * Promotes pages this chapter already cached (a read, a prefetch) to the download
 * retention, so a download adopts them instead of fetching them again and eviction
 * leaves them alone. Returns how many rows changed.
 */
export async function markChapterPagesDownloaded(
  db: AppDrizzleDb,
  input: ChapterPageRef,
): Promise<number> {
  const chapterEntries = (await chapterPageEntries(db, input)).filter(
    (entry) => entry.metadata?.retention !== CACHE_RETENTION_DOWNLOAD,
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
      metadata: { ...(entry.metadata ?? {}), retention: CACHE_RETENTION_DOWNLOAD },
    });
  }

  return chapterEntries.length;
}

export interface RemoveChapterCacheOutcome {
  readonly removedEntries: number;
  /** Bytes the deleted rows accounted for. */
  readonly removedBytes: number;
  /** Blobs whose delete failed; the next maintenance sweep reclaims them. */
  readonly failedBlobKeys: readonly string[];
}

/**
 * Removes one chapter's stored pages and their rows, for removing a download. Rows go
 * first in one statement, then blobs, so a row never outlives its blob; a failed blob
 * delete only leaves an orphan the next maintenance sweep retries.
 */
export async function removeChapterPageEntries(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  input: ChapterPageRef,
): Promise<RemoveChapterCacheOutcome> {
  const entries = await chapterPageEntries(db, input);
  if (entries.length === 0) {
    return { removedEntries: 0, removedBytes: 0, failedBlobKeys: [] };
  }

  await deleteCacheEntries(
    db,
    entries.map((entry) => entry.id),
  );
  const entryIdByBlobKey = new Map(
    entries.flatMap((entry) =>
      entry.blobKey === undefined ? [] : [[entry.blobKey, entry.id] as const],
    ),
  );
  const blobs = await deleteBlobKeys(adapter, [...entryIdByBlobKey.keys()], {
    skip: async (key) => {
      if (isBlobWriteInFlight(key)) return true;
      const entryId = entryIdByBlobKey.get(key);
      return entryId !== undefined && (await getCacheEntryById(db, entryId)) !== undefined;
    },
  });
  const failed = new Set(blobs.failedKeys);
  const removed = entries.filter(
    (entry) => entry.blobKey === undefined || !failed.has(entry.blobKey),
  );

  return {
    removedEntries: removed.length,
    removedBytes: removed.reduce((sum, entry) => sum + entry.byteSize, 0),
    failedBlobKeys: blobs.failedKeys,
  };
}

export interface DownloadCacheUsage {
  readonly pages: number;
  readonly bytes: number;
  readonly byChapter: readonly {
    readonly chapterId: string;
    readonly providerId: string;
    readonly mangaId: string;
    readonly pages: number;
    readonly bytes: number;
  }[];
}

/** Bytes and pages held by download-retained cache rows, separate from the cache total. */
export async function summarizeDownloadCache(db: AppDrizzleDb): Promise<DownloadCacheUsage> {
  const entries = await listCacheEntriesByKind(db, PAGE_CACHE_KIND);
  const byChapter = new Map<
    string,
    { chapterId: string; providerId: string; mangaId: string; pages: number; bytes: number }
  >();
  let pages = 0;
  let bytes = 0;

  for (const entry of entries) {
    if (entry.metadata?.retention !== CACHE_RETENTION_DOWNLOAD) continue;
    if (entry.chapterId === undefined) continue;
    pages += 1;
    bytes += entry.byteSize;
    const existing = byChapter.get(entry.chapterId);
    if (existing === undefined) {
      byChapter.set(entry.chapterId, {
        chapterId: entry.chapterId,
        providerId: entry.providerId,
        mangaId: entry.mangaId,
        pages: 1,
        bytes: entry.byteSize,
      });
    } else {
      existing.pages += 1;
      existing.bytes += entry.byteSize;
    }
  }

  return { pages, bytes, byChapter: [...byChapter.values()] };
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

interface PrefetchPageFailure {
  readonly pageIndex: number;
  readonly code: PageCacheFailureCode;
}

export interface PrefetchQueueOutcome {
  /** Bytes downloaded by this run; cache hits are free. */
  readonly downloadedBytes: number;
  readonly cachedPages: number;
  readonly fetchedPages: number;
  readonly failedPages: number;
  /** One entry per page this run could not cache, with why. */
  readonly failures: readonly PrefetchPageFailure[];
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
  readonly resolvePage: (page: PrefetchPage) => Promise<PrefetchPageOutcome>;
  /** Called once per settled page, so a download can persist progress per page. */
  readonly onPage?: (page: PrefetchPage, outcome: PrefetchPageOutcome) => void | Promise<void>;
}): Promise<PrefetchQueueOutcome> {
  const queue = [...input.pages];
  let downloadedBytes = 0;
  let cachedPages = 0;
  let fetchedPages = 0;
  let failedPages = 0;
  const failures: PrefetchPageFailure[] = [];
  const budgetReached = (): boolean =>
    input.budgetBytes > 0 && downloadedBytes >= input.budgetBytes;

  const worker = async (): Promise<void> => {
    for (let page = queue.shift(); page !== undefined; page = queue.shift()) {
      if (budgetReached() || input.signal?.aborted === true) return;
      // oxlint-disable-next-line eslint/no-await-in-loop
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- the 4-at-a-time bound from #71 (ruling mvd745t3): this worker pool IS the prefetch limiter
      const result = await input.resolvePage(page);
      if (result.status === 'failed') {
        failedPages += 1;
        failures.push({ pageIndex: page.pageIndex, code: result.failure.code });
      } else if (result.status === 'cached') {
        cachedPages += 1;
      } else {
        fetchedPages += 1;
        downloadedBytes += result.byteSize;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- progress must be written in settle order, so the page write follows its page
      await input.onPage?.(page, result);
    }
  };

  await Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, worker));
  return { downloadedBytes, cachedPages, fetchedPages, failedPages, failures };
}

export async function prefetchChapterPages(
  input: Omit<PageCacheLookupInput, 'pageIndex' | 'remoteUrl'> & {
    readonly pages: readonly PrefetchPage[];
    readonly retention?: CacheRetention;
    /** Maximum newly downloaded bytes; 0 or omitted means unlimited. */
    readonly budgetBytes?: number;
    readonly signal?: AbortSignal;
    readonly onPage?: (page: PrefetchPage, outcome: PrefetchPageOutcome) => void | Promise<void>;
  },
): Promise<PrefetchQueueOutcome> {
  // One chapter-scoped read beats one existence check per page on every reader
  // mount and settings edit.
  const cachedIndexes = new Set(
    await listCachedChapterPageIndexes(input.db, {
      providerId: String(input.providerId),
      mangaId: String(input.mangaId),
      chapterId: String(input.chapterId),
    }),
  );

  return runPrefetchQueue({
    pages: input.pages,
    budgetBytes: input.budgetBytes ?? 0,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
    ...(input.onPage !== undefined ? { onPage: input.onPage } : {}),
    resolvePage: (page) =>
      cachedIndexes.has(page.pageIndex)
        ? Promise.resolve<PrefetchPageOutcome>({ status: 'cached', byteSize: 0 })
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
