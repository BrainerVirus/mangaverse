import type { PageCacheLookupInput, PageCacheStoreResult } from './page-cache-store.js';
import { getCachedPageObjectUrl, resolvePageObjectUrl } from './page-cache-store.js';

export interface PageObjectUrlInput extends PageCacheLookupInput {
  readonly retention?: 'read' | 'normal';
}

export interface AcquirePageObjectUrlOptions {
  /**
   * Only hand back a URL for a page that is already in the blob cache. The
   * decode-ahead pool uses this so warming a page never spends the reader's
   * prefetch budget on a network request; the prefetch sweep owns downloads.
   */
  readonly cachedOnly?: boolean;
}

interface HeldUrl {
  url: string;
  refs: number;
  fromCache: boolean;
  byteSize: number;
}

const held = new Map<string, HeldUrl>();
/** A cache-only miss must never answer a mounted page's full acquire. */
const pendingCached = new Map<string, Promise<PageCacheStoreResult | undefined>>();
const pendingFull = new Map<string, Promise<PageCacheStoreResult | undefined>>();

/**
 * One URL per page and display cap, shared by every holder (the mounted strip
 * row, the paged layer, the decode pool). A page turn that returns to a warm
 * page then reuses the same URL, so the browser's decoded-image cache can serve
 * it instead of decoding the same blob again under a fresh object URL. The cap
 * is part of the key: a downscaled URL never answers a holder that wants the
 * original, nor the reverse.
 */
export function pageObjectUrlKey(input: PageObjectUrlInput): string {
  return [
    String(input.providerId),
    String(input.mangaId),
    String(input.chapterId),
    String(input.pageIndex),
    input.remoteUrl,
    input.retention ?? 'read',
    input.maxDisplayEdge === undefined ? 'original' : String(input.maxDisplayEdge),
  ].join('\u0000');
}

function toResult(entry: HeldUrl): PageCacheStoreResult {
  return { objectUrl: entry.url, fromCache: entry.fromCache, byteSize: entry.byteSize };
}

/**
 * Takes a reference on the URL another lookup of the page settled onto `held`.
 * A failed full acquire still has to look here: the decode pool's cache-only
 * lookup can succeed while it is in flight, and answering `undefined` then is a
 * false miss. The reverse is not true (see `acquirePageObjectUrl`).
 */
function acquireHeld(key: string): PageCacheStoreResult | undefined {
  const shared = held.get(key);
  if (shared === undefined) return undefined;
  shared.refs += 1;
  return toResult(shared);
}

/**
 * Takes a reference on the page's URL, resolving (and, unless `cachedOnly`,
 * downloading) the page on the first call. An in-flight lookup is joined only by
 * the same kind: the decode pool's cache-only miss must not answer a mounted
 * page's full acquire and turn a downloadable page into a false failure. Every
 * successful acquire must be paired with exactly one release.
 */
export async function acquirePageObjectUrl(
  input: PageObjectUrlInput,
  options: AcquirePageObjectUrlOptions = {},
): Promise<PageCacheStoreResult | undefined> {
  const key = pageObjectUrlKey(input);

  const existing = held.get(key);
  if (existing !== undefined) {
    existing.refs += 1;
    return toResult(existing);
  }

  const cachedOnly = options.cachedOnly === true;
  const pending = cachedOnly ? pendingCached : pendingFull;
  const inFlight = pending.get(key);
  if (inFlight !== undefined) {
    const result = await inFlight;
    // A cache-only miss stays a miss even if a full acquire has since held the page.
    if (result === undefined && cachedOnly) return undefined;
    return acquireHeld(key);
  }

  const lookup = cachedOnly ? getCachedPageObjectUrl : resolvePageObjectUrl;
  const promise = lookup(input);
  pending.set(key, promise);
  try {
    const result = await promise;
    if (result === undefined) return cachedOnly ? undefined : acquireHeld(key);
    // A lookup of the other kind can settle while this one is in flight. The first
    // result becomes the shared URL; this one must join it instead of overwriting
    // `held` (which would leak a URL and later revoke the one a mounted page uses).
    const concurrent = held.get(key);
    if (concurrent !== undefined) {
      concurrent.refs += 1;
      // Desktop `page://` URLs are identical; a web object URL is per call.
      if (concurrent.url !== result.objectUrl) {
        await input.adapter.blobStorage.revokeObjectUrl(result.objectUrl);
      }
      return toResult(concurrent);
    }
    held.set(key, {
      url: result.objectUrl,
      refs: 1,
      fromCache: result.fromCache,
      byteSize: result.byteSize,
    });
    return result;
  } finally {
    pending.delete(key);
  }
}

/** Drops one reference; the last holder revokes the URL. */
export async function releasePageObjectUrl(input: PageObjectUrlInput): Promise<void> {
  const key = pageObjectUrlKey(input);
  const entry = held.get(key);
  if (entry === undefined) return;

  entry.refs -= 1;
  if (entry.refs > 0) return;

  held.delete(key);
  await input.adapter.blobStorage.revokeObjectUrl(entry.url);
}
