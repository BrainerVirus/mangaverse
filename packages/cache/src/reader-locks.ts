import type { CacheChapterRef } from './cache-maintenance.js';
import { resolveLockManager, type LockManagerLike } from './web-locks.js';

/** Shared lock every mounted reader holds for its lifetime. */
export const READER_PRESENCE_LOCK = 'mangaverse:reader';

const READER_CHAPTER_LOCK_PREFIX = `${READER_PRESENCE_LOCK}:`;

/**
 * Presence of readers, as far as this runtime can prove it:
 * - `none`: an exclusive presence lock was acquired and is held for the
 *   caller's operation, so no reader can mount while it runs;
 * - `readers`: readers hold the presence lock and the listed chapters are open;
 * - `unknown`: no Web Locks API, a failed probe, or presence without an
 *   identifiable chapter. Callers must not delete anything in this case.
 */
export type ReaderPresence =
  | { readonly status: 'unknown' }
  | { readonly status: 'none'; release(): void }
  | { readonly status: 'readers'; readonly chapters: readonly CacheChapterRef[] };

type ExclusiveProbe =
  | { readonly status: 'unknown' }
  | { readonly status: 'busy' }
  | { readonly status: 'acquired'; readonly release: () => void };

function chapterKey(chapter: CacheChapterRef): string {
  return `${chapter.providerId}\u0000${chapter.mangaId}\u0000${chapter.chapterId}`;
}

function parseChapterLock(name: string): CacheChapterRef | undefined {
  if (!name.startsWith(READER_CHAPTER_LOCK_PREFIX)) return undefined;
  const parts = name.slice(READER_CHAPTER_LOCK_PREFIX.length).split(':');
  if (parts.length !== 3) return undefined;
  const [providerId, mangaId, chapterId] = parts;
  if (providerId === undefined || mangaId === undefined || chapterId === undefined) {
    return undefined;
  }
  try {
    return {
      providerId: decodeURIComponent(providerId),
      mangaId: decodeURIComponent(mangaId),
      chapterId: decodeURIComponent(chapterId),
    };
  } catch {
    return undefined;
  }
}

/**
 * Requests an exclusive presence lock just long enough to learn whether any
 * reader holds it, and keeps it until `release` when it wins. A background or
 * throttled reader still holds its shared lock, which is the point: this never
 * depends on a tab answering a message in time.
 *
 * `ifAvailable` never skips or rejects on conflict: the spec invokes the
 * callback with a `null` lock. Treating `null` as granted would report "no
 * readers" while one holds the lock and let eviction delete the open chapter,
 * so only a non-null lock marks the probe acquired.
 */
async function probeExclusive(locks: LockManagerLike): Promise<ExclusiveProbe> {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markAcquired!: () => void;
  const acquired = new Promise<void>((resolve) => {
    markAcquired = resolve;
  });

  let request: Promise<unknown>;
  try {
    request = locks.request(
      READER_PRESENCE_LOCK,
      { mode: 'exclusive', ifAvailable: true },
      (lock) => {
        if (lock === null) return Promise.resolve();
        markAcquired();
        return hold;
      },
    );
  } catch {
    return { status: 'unknown' };
  }

  const outcome = await Promise.race([
    request.then(
      () => 'busy' as const,
      () => 'unknown' as const,
    ),
    acquired.then(() => 'acquired' as const),
  ]);
  if (outcome === 'acquired') {
    return { status: 'acquired', release: () => release() };
  }
  release();
  return { status: outcome };
}

async function readOpenChapters(locks: LockManagerLike): Promise<ReaderPresence> {
  let held: readonly { readonly name?: string }[];
  try {
    held = (await locks.query()).held ?? [];
  } catch {
    return { status: 'unknown' };
  }
  // The exclusive request failed, so some reader must hold the presence lock.
  // If it is not visible, the lock manager and the query disagree.
  if (!held.some((lock) => lock.name === READER_PRESENCE_LOCK)) {
    return { status: 'unknown' };
  }

  const chapters = new Map<string, CacheChapterRef>();
  for (const lock of held) {
    if (lock.name === undefined) continue;
    const chapter = parseChapterLock(lock.name);
    if (chapter !== undefined) chapters.set(chapterKey(chapter), chapter);
  }
  // A reader holds presence but its chapter lock has not landed yet. Guessing
  // which chapter is open is exactly the failure this guard exists to prevent.
  if (chapters.size === 0) return { status: 'unknown' };
  return { status: 'readers', chapters: [...chapters.values()] };
}

/** Probes reader presence; a `none` result holds the exclusive lock until released. */
export async function probeReaderPresence(): Promise<ReaderPresence> {
  const locks = resolveLockManager();
  if (locks === undefined) return { status: 'unknown' };

  const exclusive = await probeExclusive(locks);
  if (exclusive.status === 'unknown') return { status: 'unknown' };
  if (exclusive.status === 'acquired') {
    return { status: 'none', release: exclusive.release };
  }
  return readOpenChapters(locks);
}

function requestSharedLock(
  locks: LockManagerLike,
  name: string,
  onHeld?: () => void,
  onUnavailable?: () => void,
): (() => void) | undefined {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    void locks
      .request(name, { mode: 'shared' }, async () => {
        onHeld?.();
        await held;
      })
      .catch(() => {
        // The reader keeps running without protection, but the caller is told
        // rather than left believing another tab can see this chapter.
        onUnavailable?.();
      });
  } catch {
    onUnavailable?.();
    return undefined;
  }
  return release;
}

/**
 * Holds this reader's shared presence and chapter locks until the returned
 * function runs. The chapter lock is requested only after presence is granted,
 * so an exclusive presence probe blocks a mounting reader before it can take a
 * chapter lock. The browser releases both when the document unloads or crashes,
 * so a dead tab cannot protect a chapter forever.
 *
 * `onUnavailable` runs when the browser refuses either request (or there is no
 * Web Locks API): the reader is then invisible to other tabs' eviction probes.
 */
export function holdReaderLocks(chapter: CacheChapterRef, onUnavailable?: () => void): () => void {
  const locks = resolveLockManager();
  if (locks === undefined) {
    onUnavailable?.();
    return () => undefined;
  }

  let cancelled = false;
  let releaseChapter: (() => void) | undefined;
  const releasePresence = requestSharedLock(
    locks,
    READER_PRESENCE_LOCK,
    () => {
      if (cancelled) return;
      releaseChapter = requestSharedLock(
        locks,
        readerChapterLockName(chapter),
        undefined,
        onUnavailable,
      );
    },
    onUnavailable,
  );

  return () => {
    cancelled = true;
    releaseChapter?.();
    releasePresence?.();
  };
}

export function readerChapterLockName(chapter: CacheChapterRef): string {
  return `${READER_CHAPTER_LOCK_PREFIX}${encodeURIComponent(chapter.providerId)}:${encodeURIComponent(chapter.mangaId)}:${encodeURIComponent(chapter.chapterId)}`;
}
