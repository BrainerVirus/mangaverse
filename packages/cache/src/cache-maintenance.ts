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
 * stays above the limit until the reader closes it.
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

    const deleted: CacheEntryRecord[] = [];
    for (const entry of candidate.entries) {
      if (entry.blobKey !== undefined) {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- blob deletes and the single row delete must stay in order so a failed blob delete keeps its row
        const result = await adapter.blobStorage.delete(entry.blobKey);
        if (!result.ok) {
          continue;
        }
      }
      deleted.push(entry);
    }
    if (deleted.length === 0) {
      continue;
    }

    await deleteCacheEntries(
      db,
      deleted.map((entry) => entry.id),
    );
    for (const entry of deleted) {
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
