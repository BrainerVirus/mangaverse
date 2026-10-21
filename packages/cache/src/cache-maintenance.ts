import type { AppDrizzleDb, CacheEntryRecord } from '@app/db';
import { deleteCacheEntries, listCacheEntriesByKind, summarizeCacheStorage } from '@app/db';
import type { PlatformAdapter } from '@app/platform';

import { deleteBlobKeys } from './blob-deletes.js';
import { COVER_CACHE_KIND, PAGE_CACHE_KIND } from './constants.js';
import { reclaimOrphanBlobs } from './orphan-blobs.js';
import { probeReaderPresence } from './reader-locks.js';

export interface CacheChapterRef {
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId: string;
}

export interface EvictCacheOptions {
  readonly limitBytes: number;
  /** Chapter open in this tab: never evicted, so the store may overshoot until it closes. */
  readonly protectChapter?: CacheChapterRef;
}

export interface CacheEvictionOutcome {
  readonly evictedCount: number;
  /** Row-less blobs left behind; the next maintenance sweep retries them. */
  readonly failedBlobKeys: readonly string[];
}

interface EvictionCandidate {
  readonly lastAccessAt: string;
  readonly entries: readonly CacheEntryRecord[];
}

function isProtectedChapter(
  entry: CacheEntryRecord,
  chapters: readonly CacheChapterRef[],
): boolean {
  return chapters.some(
    (chapter) =>
      entry.providerId === chapter.providerId &&
      entry.mangaId === chapter.mangaId &&
      entry.chapterId === chapter.chapterId,
  );
}

/**
 * One candidate per chapter so eviction never leaves a half-cached chapter.
 * shortcut: grouping happens in JS over the kind index; move to a SQL GROUP BY
 * once page counts make the scan measurable.
 */
function groupPagesByChapter(entries: readonly CacheEntryRecord[]): EvictionCandidate[] {
  const chapters = new Map<string, { lastAccessAt: string; entries: CacheEntryRecord[] }>();

  for (const entry of entries) {
    const key = `${entry.providerId}\u0000${entry.mangaId}\u0000${entry.chapterId ?? ''}`;
    const chapter = chapters.get(key);
    if (chapter === undefined) {
      chapters.set(key, { lastAccessAt: entry.lastAccessAt, entries: [entry] });
      continue;
    }
    chapter.entries.push(entry);
    if (entry.lastAccessAt > chapter.lastAccessAt) {
      chapter.lastAccessAt = entry.lastAccessAt;
    }
  }

  return [...chapters.values()];
}

/**
 * Evicts covers and whole chapters oldest-first until the store fits `limitBytes`.
 * The chapter open in this tab, and any chapter a live tab holds a reader lock
 * for, is skipped entirely: if it is the only candidate the store stays above
 * the limit until the reader closes it. Candidates are selected first and
 * deleted in one batched row statement, then their blobs; a row never outlives
 * the blob it points at. A failed blob delete only leaks an orphan blob, which
 * the next maintenance sweep retries. Rows (SQLite) and blobs (IndexedDB) are
 * separate stores, so no individual pair is deleted atomically and a concurrent
 * write can land between the batch and the sweep.
 *
 * Reader presence is proven with Web Locks, never a timed message: with no
 * reader, the exclusive presence lock is held for the whole eviction so a
 * reader cannot mount mid-sweep. If presence cannot be proven, nothing is
 * evicted; a background or throttled reader is still visible through
 * `navigator.locks.query()`.
 */
export async function evictCacheToLimit(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  options: EvictCacheOptions,
): Promise<CacheEvictionOutcome> {
  const summary = await summarizeCacheStorage(db);
  if (summary.totalBytes <= options.limitBytes) {
    return { evictedCount: 0, failedBlobKeys: [] };
  }

  const presence = await probeReaderPresence();
  if (presence.status === 'unknown') {
    return { evictedCount: 0, failedBlobKeys: [] };
  }

  try {
    const [covers, pages] = await Promise.all([
      listCacheEntriesByKind(db, COVER_CACHE_KIND),
      listCacheEntriesByKind(db, PAGE_CACHE_KIND),
    ]);
    const protectedChapters = [
      ...(options.protectChapter !== undefined ? [options.protectChapter] : []),
      ...(presence.status === 'readers' ? presence.chapters : []),
    ];
    const candidates = [
      ...covers.map((entry) => ({ lastAccessAt: entry.lastAccessAt, entries: [entry] })),
      ...groupPagesByChapter(pages),
    ].sort((left, right) => left.lastAccessAt.localeCompare(right.lastAccessAt));

    let bytesToFree = summary.totalBytes - options.limitBytes;
    const selected: CacheEntryRecord[] = [];
    for (const candidate of candidates) {
      if (bytesToFree <= 0) {
        break;
      }
      if (isProtectedChapter(candidate.entries[0]!, protectedChapters)) {
        continue;
      }
      for (const entry of candidate.entries) {
        selected.push(entry);
        bytesToFree -= entry.byteSize;
      }
    }

    if (selected.length === 0) {
      return { evictedCount: 0, failedBlobKeys: [] };
    }

    // Rows first, in one batched statement: the offline note and the row-based cap
    // read rows, so a row must never outlive its blob.
    await deleteCacheEntries(
      db,
      selected.map((entry) => entry.id),
    );
    const blobKeys = selected.flatMap((entry) =>
      entry.blobKey === undefined ? [] : [entry.blobKey],
    );
    const blobs = await deleteBlobKeys(adapter, blobKeys);

    return { evictedCount: selected.length, failedBlobKeys: blobs.failedKeys };
  } finally {
    if (presence.status === 'none') presence.release();
  }
}

export interface CacheMaintenanceOutcome {
  readonly evictedCount: number;
  readonly totalBytes: number;
  /** Blobs still row-less after this pass; the next pass retries them. */
  readonly failedBlobDeletes: number;
  /** Orphan blobs claimed this pass, including a same-pass retry of a failed delete. */
  readonly reclaimedBlobs: number;
}

export async function runCacheMaintenance(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  limitBytes: number,
): Promise<CacheMaintenanceOutcome> {
  const eviction = await evictCacheToLimit(db, adapter, { limitBytes });
  // The sweep retries eviction's failed deletes in the same pass. It runs even
  // under the limit: an orphan inflated real storage without a row, so row
  // accounting alone would never shrink it. Row totals are unaffected by the
  // sweep, so they can be read alongside it. A key eviction failed to delete
  // but the sweep did delete is settled, not still failing.
  const [orphans, summary] = await Promise.all([
    reclaimOrphanBlobs(db, adapter, eviction.failedBlobKeys),
    summarizeCacheStorage(db),
  ]);
  const reclaimed = new Set(orphans.reclaimedKeys);
  const failedBlobKeys = new Set(orphans.failedBlobKeys);
  for (const key of eviction.failedBlobKeys) {
    if (!reclaimed.has(key)) failedBlobKeys.add(key);
  }
  return {
    evictedCount: eviction.evictedCount,
    totalBytes: summary.totalBytes,
    failedBlobDeletes: failedBlobKeys.size,
    reclaimedBlobs: orphans.reclaimedKeys.length,
  };
}

export interface CacheMaintenanceRequest {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly limitBytes: number;
}

export interface CacheMaintenanceScheduler {
  /** Coalesces a burst of misses into one run; a request during a run is trailed once. */
  request(input: CacheMaintenanceRequest): void;
}

/**
 * A grid load reports one cache miss per cover. Running a full summary + scan
 * for each was the maintenance storm; this keeps at most one run per quiet
 * window and never two at once. The delay is not a durability point: cache
 * rows are already written before maintenance is requested.
 */
export function createCacheMaintenanceScheduler(
  run: (input: CacheMaintenanceRequest) => Promise<unknown>,
  delayMs = 250,
): CacheMaintenanceScheduler {
  let pending: CacheMaintenanceRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const drain = async (): Promise<void> => {
    const next = pending;
    pending = null;
    if (next === null) return;

    running = Promise.resolve(run(next))
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
    await running;
    // A miss that arrived while the scan was running gets its own trailing run.
    if (pending !== null) schedule();
  };

  const schedule = (): void => {
    if (timer !== null || running !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, delayMs);
  };

  return {
    request(input) {
      pending = input;
      schedule();
    },
  };
}

const coverMaintenanceScheduler = createCacheMaintenanceScheduler((input) =>
  runCacheMaintenance(input.db, input.adapter, input.limitBytes),
);

/** Queues one coalesced maintenance pass for the current cache limit. */
export function requestCacheMaintenance(input: CacheMaintenanceRequest): void {
  coverMaintenanceScheduler.request(input);
}
