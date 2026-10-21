import type { AppDrizzleDb, CacheEntryRecord } from '@app/db';
import { deleteCacheEntries, listCacheEntriesByKind, summarizeCacheStorage } from '@app/db';
import type { PlatformAdapter } from '@app/platform';

import { COVER_CACHE_KIND, PAGE_CACHE_KIND } from './constants.js';

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

interface EvictionCandidate {
  readonly lastAccessAt: string;
  readonly entries: readonly CacheEntryRecord[];
}

function isProtectedChapter(
  entry: CacheEntryRecord,
  chapter: CacheChapterRef | undefined,
): boolean {
  return (
    chapter !== undefined &&
    entry.providerId === chapter.providerId &&
    entry.mangaId === chapter.mangaId &&
    entry.chapterId === chapter.chapterId
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
 * The protected chapter is skipped entirely: if it is the only candidate the store
 * stays above the limit until the reader closes it. Every candidate's rows are
 * deleted before its blobs, so a row never outlives the blob it points at; a failed
 * blob delete only leaks an orphan blob that row-based accounting cannot see.
 */
export async function evictCacheToLimit(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  options: EvictCacheOptions,
): Promise<number> {
  const summary = await summarizeCacheStorage(db);
  if (summary.totalBytes <= options.limitBytes) {
    return 0;
  }

  let bytesToFree = summary.totalBytes - options.limitBytes;
  let evicted = 0;
  const [covers, pages] = await Promise.all([
    listCacheEntriesByKind(db, COVER_CACHE_KIND),
    listCacheEntriesByKind(db, PAGE_CACHE_KIND),
  ]);
  const candidates = [
    ...covers.map((entry) => ({ lastAccessAt: entry.lastAccessAt, entries: [entry] })),
    ...groupPagesByChapter(pages),
  ].sort((left, right) => left.lastAccessAt.localeCompare(right.lastAccessAt));

  for (const candidate of candidates) {
    if (bytesToFree <= 0) {
      break;
    }
    if (isProtectedChapter(candidate.entries[0]!, options.protectChapter)) {
      continue;
    }

    // Rows first, in one batch: the offline note and the row-based cap read rows,
    // so a row must never outlive its blob. Blob deletes are best-effort; a failed
    // one leaves an orphan the accounting cannot see.
    // shortcut: orphans are never retried; sweep them separately if delete failures grow.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- each candidate's rows are freed before the next candidate is measured
    await deleteCacheEntries(
      db,
      candidate.entries.map((entry) => entry.id),
    );
    for (const entry of candidate.entries) {
      if (entry.blobKey === undefined) {
        continue;
      }
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- blob deletes stay ordered per entry and never gate eviction
      await adapter.blobStorage.delete(entry.blobKey);
    }
    for (const entry of candidate.entries) {
      bytesToFree -= entry.byteSize;
      evicted += 1;
    }
  }

  return evicted;
}

export async function runCacheMaintenance(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  limitBytes: number,
): Promise<{ evictedCount: number; totalBytes: number }> {
  const evictedCount = await evictCacheToLimit(db, adapter, { limitBytes });
  const summary = await summarizeCacheStorage(db);
  return { evictedCount, totalBytes: summary.totalBytes };
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
