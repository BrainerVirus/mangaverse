import type { AppDrizzleDb } from '@app/db';
import {
  getCacheEntryByKey,
  summarizeCacheStorage,
  touchCacheEntry,
  upsertCacheEntry,
} from '@app/db';
import type { PlatformAdapter } from '@app/platform';
import type { MangaId, ProviderId } from '@app/shared';

import {
  buildCoverBlobKey,
  buildCoverCacheEntryId,
  buildCoverPageKey,
  COVER_CACHE_KIND,
} from './constants.js';
import { withBlobWrite } from './blob-writes.js';

export interface CoverCacheLookupInput {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly providerId: ProviderId | string;
  readonly mangaId: MangaId | string;
  readonly remoteUrl: string;
  /**
   * The URL came from the user (a custom cover), not the provider manifest. It
   * bypasses only the provider allowlist; main still enforces its public-URL,
   * redirect, size and time checks.
   */
  readonly userProvided?: boolean;
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

/**
 * The store's own URL for a cover, when it serves covers by URL (desktop: `page://`).
 * `null` means this store has none, so the caller reads IndexedDB bytes instead.
 */
async function resolveStoredCoverUrl(
  adapter: PlatformAdapter,
  blobKey: string,
): Promise<string | undefined | null> {
  if (adapter.blobStorage.resolveUrl === undefined) return null;
  const result = await adapter.blobStorage.resolveUrl(blobKey);
  return result.ok ? result.value : null;
}

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

  // The entry is keyed by provider + manga, so a changed source URL (for
  // example a custom cover) must miss instead of painting the previous blob.
  if (entry?.blobKey === undefined || entry.sourceUrl !== input.remoteUrl) {
    return undefined;
  }

  const storedUrl = await resolveStoredCoverUrl(input.adapter, entry.blobKey);
  if (storedUrl !== null) {
    if (storedUrl === undefined) return undefined;
    await touchCacheEntry(input.db, entry.id);
    return { objectUrl: storedUrl, fromCache: true };
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

  const putResult = await withBlobWrite(blobKey, async () => {
    const put = await input.adapter.blobStorage.put(blobKey, input.data, input.mimeType);
    if (!put.ok) return false;
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
    return true;
  });
  if (!putResult) {
    return undefined;
  }

  const objectUrl = await createObjectUrlFromBlob(input.adapter, input.data, input.mimeType);
  if (objectUrl === undefined) {
    return undefined;
  }

  return { objectUrl, fromCache: false };
}

/**
 * Desktop path: main fetches the cover and writes it to the page store. A provider
 * cover runs under the provider's allowlist; a user-supplied custom cover runs
 * through the user-initiated path, which keeps every SSRF/size/time check but has
 * no manifest to authorize the host. Returns its `page://` URL, never the bytes.
 */
async function storeCoverInMain(
  input: CoverCacheLookupInput,
): Promise<CoverCacheStoreResult | undefined> {
  const providerId = String(input.providerId);
  const mangaId = String(input.mangaId);
  const blobKey = buildCoverPageKey(providerId, mangaId);
  const userProvided = input.userProvided === true;

  const result = userProvided
    ? await input.adapter.providerNetwork.fetchAndStoreUserInitiated?.({
        url: input.remoteUrl,
        key: blobKey,
      })
    : await input.adapter.providerNetwork.fetchAndStore?.({
        providerId,
        url: input.remoteUrl,
        key: blobKey,
      });
  if (result === undefined || !result.ok || result.value === undefined) return undefined;

  const stored = result.value;
  await withBlobWrite(blobKey, async () => {
    await upsertCacheEntry(input.db, {
      id: buildCoverCacheEntryId(providerId, mangaId),
      providerId,
      mangaId,
      cacheKind: COVER_CACHE_KIND,
      sourceUrl: input.remoteUrl,
      mimeType: stored.mimeType,
      byteSize: stored.byteSize,
      blobKey,
    });
  });
  return { objectUrl: stored.url, fromCache: false };
}

async function fetchRemoteCover(
  adapter: PlatformAdapter,
  providerId: string,
  remoteUrl: string,
  userProvided: boolean,
): Promise<{ data: ArrayBuffer; mimeType: string } | undefined> {
  // Web has no main process; the same manifest-domain table the provider adapter
  // enforces also gates cover bytes fetched here. A user-supplied custom cover
  // bypasses the provider allowlist, exactly like the desktop user-initiated path.
  if (
    !userProvided &&
    adapter.providerNetwork.isAllowedHost !== undefined &&
    !adapter.providerNetwork.isAllowedHost(providerId, remoteUrl)
  ) {
    return undefined;
  }
  const result = await adapter.network.fetchBytes(remoteUrl);
  if (!result.ok || result.value === undefined) {
    return undefined;
  }
  return result.value;
}

export async function resolveCoverObjectUrl(
  input: CoverCacheLookupInput,
): Promise<CoverCacheStoreResult | undefined> {
  const cached = await getCachedCoverObjectUrl(input);
  if (cached !== undefined) {
    return cached;
  }

  const fetchKey = `${buildCoverBlobKey(
    String(input.providerId),
    String(input.mangaId),
  )}\u0000${input.remoteUrl}`;
  const existingFetch = inFlightFetches.get(fetchKey);
  if (existingFetch !== undefined) {
    const objectUrl = await existingFetch;
    return objectUrl !== undefined ? { objectUrl, fromCache: false } : undefined;
  }

  const fetchPromise = (async () => {
    const canStoreInMain =
      input.userProvided === true
        ? input.adapter.providerNetwork.fetchAndStoreUserInitiated !== undefined
        : input.adapter.providerNetwork.fetchAndStore !== undefined;
    if (canStoreInMain) {
      const stored = await storeCoverInMain(input);
      return stored?.objectUrl;
    }
    const remote = await fetchRemoteCover(
      input.adapter,
      String(input.providerId),
      input.remoteUrl,
      input.userProvided === true,
    );
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

/** Returns a local blob URL for a cover, or undefined while loading / on cache miss. Never returns remote URLs. */
export async function resolveCoverUrl(input: CoverCacheLookupInput): Promise<string | undefined> {
  const result = await resolveCoverObjectUrl(input);
  return result?.objectUrl;
}
