import type { AppDrizzleDb } from '@app/db';
import {
  getCacheEntryById,
  listCacheEntriesByKind,
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
}

const inFlightPageFetches = new Map<string, Promise<string | undefined>>();

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
  return { objectUrl, fromCache: true };
}

export async function storePageInCache(
  input: PageCacheLookupInput & {
    readonly data: ArrayBuffer;
    readonly mimeType: string;
    readonly retention?: typeof CACHE_RETENTION_READ | 'normal';
  },
): Promise<PageCacheStoreResult | undefined> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const chapterId = String(input.chapterId);
  const blobKey = buildPageBlobKey(providerId, mangaId, chapterId, input.pageIndex);
  const entryId = buildPageCacheEntryId(providerId, mangaId, chapterId, input.pageIndex);

  const putResult = await input.adapter.blobStorage.put(blobKey, input.data, input.mimeType);
  if (!putResult.ok) {
    return undefined;
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

  const objectUrl = await createObjectUrlFromBlob(input.adapter, input.data, input.mimeType);
  if (objectUrl === undefined) {
    return undefined;
  }

  return { objectUrl, fromCache: false };
}

export async function resolvePageObjectUrl(
  input: PageCacheLookupInput & { readonly retention?: typeof CACHE_RETENTION_READ | 'normal' },
): Promise<PageCacheStoreResult | undefined> {
  const cached = await getCachedPageObjectUrl(input);
  if (cached !== undefined) {
    return cached;
  }

  const fetchKey = buildPageBlobKey(
    String(input.providerId),
    String(input.mangaId),
    String(input.chapterId),
    input.pageIndex,
  );
  const existingFetch = inFlightPageFetches.get(fetchKey);
  if (existingFetch !== undefined) {
    const objectUrl = await existingFetch;
    return objectUrl !== undefined ? { objectUrl, fromCache: false } : undefined;
  }

  const fetchPromise = (async () => {
    const remote = await fetchRemotePage(input.adapter, input.remoteUrl);
    if (remote === undefined) {
      return undefined;
    }
    const stored = await storePageInCache({ ...input, ...remote });
    return stored?.objectUrl;
  })();

  inFlightPageFetches.set(fetchKey, fetchPromise);
  try {
    const objectUrl = await fetchPromise;
    return objectUrl !== undefined ? { objectUrl, fromCache: false } : undefined;
  } finally {
    inFlightPageFetches.delete(fetchKey);
  }
}

/** Returns a local blob URL for a page, or undefined while loading / on cache miss. Never returns remote URLs. */
export async function resolvePageUrl(
  input: PageCacheLookupInput,
): Promise<string | undefined> {
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
  const entries = await listCacheEntriesByKind(db, PAGE_CACHE_KIND);
  const chapterEntries = entries.filter(
    (entry) =>
      entry.providerId === input.providerId &&
      entry.mangaId === input.mangaId &&
      entry.chapterId === input.chapterId,
  );

  for (const entry of chapterEntries) {
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

export async function prefetchChapterPages(
  input: Omit<PageCacheLookupInput, 'pageIndex' | 'remoteUrl'> & {
    readonly pages: readonly { readonly pageIndex: number; readonly remoteUrl: string }[];
    readonly retention?: typeof CACHE_RETENTION_READ | 'normal';
  },
): Promise<void> {
  await Promise.all(
    input.pages.map((page) =>
      resolvePageObjectUrl({
        db: input.db,
        adapter: input.adapter,
        providerId: input.providerId,
        mangaId: input.mangaId,
        chapterId: input.chapterId,
        pageIndex: page.pageIndex,
        remoteUrl: page.remoteUrl,
        ...(input.retention !== undefined ? { retention: input.retention } : {}),
      }),
    ),
  );
}
