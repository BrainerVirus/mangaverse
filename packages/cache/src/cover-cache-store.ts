import type { AppDrizzleDb } from '@app/db';
import {
  deleteCacheEntry,
  getCacheEntryByKey,
  listCacheEntriesByKind,
  summarizeCacheStorage,
  touchCacheEntry,
  upsertCacheEntry,
} from '@app/db';
import type { PlatformAdapter } from '@app/platform';
import type { MangaId, ProviderId } from '@app/shared';

import {
  buildCoverBlobKey,
  buildCoverCacheEntryId,
  COVER_CACHE_KIND,
} from './constants.js';

export interface CoverCacheLookupInput {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly remoteUrl: string;
}

export interface CoverCacheStoreResult {
  readonly objectUrl: string;
  readonly fromCache: boolean;
}

export interface CoverCacheUsageSummary {
  readonly totalBytes: number;
  readonly totalCount: number;
}

const inFlightFetches = new Map<string, Promise<string | undefined>>();

async function createObjectUrlFromBlob(
  adapter: PlatformAdapter,
  data: ArrayBuffer,
  mimeType: string,
): Promise<string | undefined> {
  const result = await adapter.blobStorage.createObjectUrl(data, mimeType);
  return result.ok ? result.value : undefined;
}

export async function getCachedCoverObjectUrl(
  input: CoverCacheLookupInput,
): Promise<CoverCacheStoreResult | undefined> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const entry = await getCacheEntryByKey(input.db, {
    providerId,
    mangaId,
    cacheKind: COVER_CACHE_KIND,
  });

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

export async function storeCoverInCache(
  input: CoverCacheLookupInput & {
    readonly data: ArrayBuffer;
    readonly mimeType: string;
  },
): Promise<CoverCacheStoreResult | undefined> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const blobKey = buildCoverBlobKey(providerId, mangaId);
  const entryId = buildCoverCacheEntryId(providerId, mangaId);

  const putResult = await input.adapter.blobStorage.put(blobKey, input.data, input.mimeType);
  if (!putResult.ok) {
    return undefined;
  }

  await upsertCacheEntry(input.db, {
    id: entryId,
    providerId,
    mangaId,
    cacheKind: COVER_CACHE_KIND,
    sourceUrl: input.remoteUrl,
    mimeType: input.mimeType,
    byteSize: input.data.byteLength,
    blobKey,
  });

  const objectUrl = await createObjectUrlFromBlob(input.adapter, input.data, input.mimeType);
  if (objectUrl === undefined) {
    return undefined;
  }

  return { objectUrl, fromCache: false };
}

async function fetchRemoteCover(remoteUrl: string): Promise<{ data: ArrayBuffer; mimeType: string } | undefined> {
  try {
    const response = await fetch(remoteUrl, { referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      return undefined;
    }
    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
    const data = await response.arrayBuffer();
    if (data.byteLength === 0) {
      return undefined;
    }
    return { data, mimeType };
  } catch {
    return undefined;
  }
}

export async function resolveCoverObjectUrl(
  input: CoverCacheLookupInput,
): Promise<CoverCacheStoreResult | undefined> {
  const cached = await getCachedCoverObjectUrl(input);
  if (cached !== undefined) {
    return cached;
  }

  const fetchKey = buildCoverBlobKey(String(input.providerId), String(input.mangaId));
  const existingFetch = inFlightFetches.get(fetchKey);
  if (existingFetch !== undefined) {
    const objectUrl = await existingFetch;
    return objectUrl !== undefined ? { objectUrl, fromCache: false } : undefined;
  }

  const fetchPromise = (async () => {
    const remote = await fetchRemoteCover(input.remoteUrl);
    if (remote === undefined) {
      return undefined;
    }
    const stored = await storeCoverInCache({ ...input, ...remote });
    return stored?.objectUrl;
  })();

  inFlightFetches.set(fetchKey, fetchPromise);
  try {
    const objectUrl = await fetchPromise;
    return objectUrl !== undefined ? { objectUrl, fromCache: false } : undefined;
  } finally {
    inFlightFetches.delete(fetchKey);
  }
}

export async function getCoverCacheUsage(db: AppDrizzleDb): Promise<CoverCacheUsageSummary> {
  const summary = await summarizeCacheStorage(db);
  return {
    totalBytes: summary.totalBytes,
    totalCount: summary.totalCount,
  };
}

export async function evictCoverCacheToLimit(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  limitBytes: number,
): Promise<number> {
  const summary = await summarizeCacheStorage(db);
  if (summary.totalBytes <= limitBytes) {
    return 0;
  }

  let bytesToFree = summary.totalBytes - limitBytes;
  let evicted = 0;
  const entries = await listCacheEntriesByKind(db, COVER_CACHE_KIND);

  for (const entry of entries) {
    if (bytesToFree <= 0) {
      break;
    }

    if (entry.blobKey !== undefined) {
      await adapter.blobStorage.delete(entry.blobKey);
    }
    await deleteCacheEntry(db, entry.id);
    bytesToFree -= entry.byteSize;
    evicted += 1;
  }

  return evicted;
}

export async function runCoverCacheMaintenance(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  limitBytes: number,
): Promise<{ evictedCount: number; totalBytes: number }> {
  const evictedCount = await evictCoverCacheToLimit(db, adapter, limitBytes);
  const usage = await getCoverCacheUsage(db);
  return { evictedCount, totalBytes: usage.totalBytes };
}
