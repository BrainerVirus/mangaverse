import type { AppDrizzleDb, DownloadRecord, DownloadStatus } from '@app/db';
import {
  getDownload,
  listActiveDownloads,
  removeDownload,
  updateDownloadState,
  upsertDownload,
} from '@app/db';
import {
  CACHE_RETENTION_DOWNLOAD,
  listCachedChapterPageIndexes,
  markChapterPagesDownloaded,
  prefetchChapterPages,
  removeChapterPageEntries,
  summarizeDownloadCache,
  type PageCacheFailureCode,
} from '@app/cache';
import type { PlatformAdapter } from '@app/platform';
import type { Chapter, ChapterId } from '@app/shared';

/** What the engine needs to fetch a chapter's page list through the provider transport. */
export interface DownloadChapterSource {
  readonly chapter: Chapter;
  readonly providerId: string;
}

export interface DownloadEngineDeps {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  /** A plain local read: queueing must not touch the network. */
  readChapter: (chapterId: ChapterId) => Promise<DownloadChapterSource | undefined>;
  /** Resolves the chapter and, through the provider transport gate, its page URLs. */
  loadChapter: (
    chapterId: ChapterId,
    signal?: AbortSignal,
  ) => Promise<DownloadChapterSource | undefined>;
  /** Persisted state changed; caches that list downloads should refetch. */
  onChanged?: () => void;
  /** A page could not be stored because the device is full. */
  onStorageFull?: (download: DownloadRecord) => void;
}

interface ActiveDownloadProgress {
  readonly chapterId: string;
  readonly status: DownloadStatus;
  readonly completedPages: number;
  readonly pageCount: number;
}

export interface DownloadEngineSnapshot {
  readonly revision: number;
  readonly active: ActiveDownloadProgress | null;
}

export interface DownloadEngine {
  /** Resumes unfinished downloads. Idempotent; the first subscriber starts it. */
  start(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): DownloadEngineSnapshot;
  enqueue(chapterId: ChapterId): Promise<void>;
  cancel(chapterId: ChapterId): Promise<void>;
  retry(chapterId: ChapterId): Promise<void>;
  remove(
    chapterId: ChapterId,
  ): Promise<{ readonly removedPages: number; readonly removedBytes: number }>;
}

/** Attempts per page before the rest of the chapter is kept as partial. */
const PAGE_ATTEMPTS = 3;

const EMPTY_SNAPSHOT: DownloadEngineSnapshot = { revision: 0, active: null };

function failureCodeFor(indexes: ReadonlyMap<number, PageCacheFailureCode>): string | undefined {
  for (const code of indexes.values()) return code;
  return undefined;
}

export function createDownloadEngine(deps: DownloadEngineDeps): DownloadEngine {
  const { db, adapter } = deps;
  const listeners = new Set<() => void>();
  let snapshot: DownloadEngineSnapshot = EMPTY_SNAPSHOT;
  let started = false;
  let running = false;
  let wakeRequested = false;
  let current: { readonly chapterId: string; readonly controller: AbortController } | null = null;
  let active: ActiveDownloadProgress | null = null;
  let currentTask: Promise<void> | null = null;

  function emit(next: ActiveDownloadProgress | null = active): void {
    active = next;
    snapshot = { revision: snapshot.revision + 1, active };
    for (const listener of [...listeners]) listener();
  }

  function changed(): void {
    deps.onChanged?.();
  }

  function providerIdFor(chapter: Chapter, fallback?: string): string {
    if (chapter.providerId !== undefined && String(chapter.providerId).length > 0) {
      return String(chapter.providerId);
    }
    return fallback ?? '';
  }

  async function nextTask(): Promise<DownloadRecord | undefined> {
    const rows = await listActiveDownloads(db);
    return rows[0];
  }

  async function markStart(
    row: DownloadRecord,
    providerId: string,
    pageCount: number,
  ): Promise<DownloadRecord> {
    return upsertDownload(db, {
      chapterId: row.chapterId,
      mangaId: row.mangaId,
      providerId,
      status: 'downloading',
      pageCount,
      completedPages: row.completedPages,
      failedPageIndexes: row.failedPageIndexes,
      attempts: row.attempts + 1,
      startedAt: row.startedAt ?? new Date().toISOString(),
      completedAt: null,
    });
  }

  async function finish(
    row: DownloadRecord,
    status: DownloadStatus,
    lastErrorCode: string | null,
    completedPages: number,
    pageCount: number,
    failedPageIndexes: readonly number[],
  ): Promise<DownloadRecord | undefined> {
    const currentRow = await getDownload(db, row.chapterId);
    // A cancel or a removal that landed while the last pages were settling wins.
    if (currentRow === undefined || currentRow.status === 'cancelled') {
      changed();
      return currentRow;
    }
    const finished = await upsertDownload(db, {
      chapterId: row.chapterId,
      mangaId: row.mangaId,
      providerId: row.providerId,
      status,
      pageCount,
      completedPages,
      failedPageIndexes,
      attempts: row.attempts,
      lastErrorCode,
      startedAt: row.startedAt ?? null,
      completedAt: status === 'complete' ? new Date().toISOString() : null,
    });
    changed();
    if (lastErrorCode === 'storage-full') deps.onStorageFull?.(finished);
    return finished;
  }

  async function run(row: DownloadRecord, controller: AbortController): Promise<void> {
    const source = await deps.loadChapter(row.chapterId as ChapterId, controller.signal);
    if (source === undefined) {
      await finish(row, 'failed', 'chapter-missing', row.completedPages, row.pageCount, []);
      return;
    }

    const { chapter } = source;
    const providerId = providerIdFor(chapter, source.providerId);
    const pages = chapter.pages.map((page) => ({
      pageIndex: page.index,
      remoteUrl: page.image.url,
    }));
    const pageCount = pages.length;
    if (pageCount === 0 || providerId.length === 0) {
      await finish(
        row,
        'failed',
        pageCount === 0 ? 'no-pages' : 'no-provider',
        0,
        pageCount,
        pages.map((page) => page.pageIndex),
      );
      return;
    }

    const started = await markStart(row, providerId, pageCount);
    await markChapterPagesDownloaded(db, {
      providerId,
      mangaId: chapter.mangaId,
      chapterId: row.chapterId,
    });

    const cached = new Set(
      await listCachedChapterPageIndexes(db, {
        providerId,
        mangaId: chapter.mangaId,
        chapterId: row.chapterId,
      }),
    );
    const cachedInChapter = (): number =>
      pages.reduce((count, page) => (cached.has(page.pageIndex) ? count + 1 : count), 0);
    let completedPages = cachedInChapter();
    const failures = new Map<number, PageCacheFailureCode>();
    let storageFull = false;

    const progress = (): ActiveDownloadProgress => ({
      chapterId: row.chapterId,
      status: 'downloading',
      completedPages,
      pageCount,
    });
    emit(progress());

    let writeChain: Promise<void> = Promise.resolve();
    const persistProgress = (): Promise<void> => {
      writeChain = writeChain
        .then(async () => {
          const currentRow = await getDownload(db, row.chapterId);
          if (currentRow === undefined || currentRow.status === 'cancelled') return;
          await upsertDownload(db, {
            chapterId: started.chapterId,
            mangaId: started.mangaId,
            providerId: started.providerId,
            status: 'downloading',
            pageCount,
            completedPages,
            failedPageIndexes: [...failures.keys()].sort((left, right) => left - right),
            attempts: started.attempts,
            lastErrorCode: null,
            startedAt: started.startedAt ?? null,
            completedAt: null,
          });
        })
        .catch(() => undefined);
      return writeChain;
    };

    for (let attempt = 0; attempt < PAGE_ATTEMPTS; attempt += 1) {
      const remaining = pages.filter((page) => !cached.has(page.pageIndex));
      if (remaining.length === 0 || controller.signal.aborted) break;

      // oxlint-disable-next-line eslint/no-await-in-loop
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- one bounded pass over the pages that still failed is the retry, and passes must not overlap
      const outcome = await prefetchChapterPages({
        db,
        adapter,
        providerId,
        mangaId: chapter.mangaId,
        chapterId: row.chapterId,
        pages: remaining,
        retention: CACHE_RETENTION_DOWNLOAD,
        signal: controller.signal,
        onPage: async (page, result) => {
          if (result.status === 'failed') {
            failures.set(page.pageIndex, result.failure.code);
            if (result.failure.code === 'storage-full') {
              storageFull = true;
              controller.abort();
            }
          } else {
            cached.add(page.pageIndex);
            failures.delete(page.pageIndex);
            completedPages = cachedInChapter();
          }
          emit(progress());
          await persistProgress();
        },
      });
      if (outcome.failedPages === 0 || storageFull || controller.signal.aborted) break;
    }

    // A reader prefetch racing this download can write an ordinary page; promote once
    // more so every page of a downloaded chapter stays protected.
    await markChapterPagesDownloaded(db, {
      providerId,
      mangaId: chapter.mangaId,
      chapterId: row.chapterId,
    });

    const missing = pages
      .filter((page) => !cached.has(page.pageIndex))
      .map((page) => page.pageIndex);
    const currentRow = await getDownload(db, row.chapterId);
    if (currentRow === undefined || currentRow.status === 'cancelled') {
      changed();
      return;
    }

    if (storageFull) {
      await finish(started, 'failed', 'storage-full', completedPages, pageCount, missing);
      return;
    }
    if (missing.length > 0) {
      await finish(
        started,
        completedPages > 0 ? 'partial' : 'failed',
        failureCodeFor(failures) ?? 'page-unavailable',
        completedPages,
        pageCount,
        missing,
      );
      return;
    }
    await finish(started, 'complete', null, completedPages, pageCount, []);
  }

  async function process(row: DownloadRecord): Promise<void> {
    const controller = new AbortController();
    current = { chapterId: row.chapterId, controller };
    emit({
      chapterId: row.chapterId,
      status: 'downloading',
      completedPages: row.completedPages,
      pageCount: row.pageCount,
    });
    await run(row, controller)
      .catch(async () => {
        const currentRow = await getDownload(db, row.chapterId);
        if (currentRow !== undefined && currentRow.status !== 'cancelled') {
          await upsertDownload(db, {
            ...currentRow,
            status: currentRow.completedPages > 0 ? 'partial' : 'failed',
            lastErrorCode: 'download-failed',
          });
          changed();
        }
      })
      .finally(() => {
        current = null;
        emit(null);
      });
  }

  async function pump(): Promise<void> {
    if (running) {
      wakeRequested = true;
      return;
    }
    running = true;
    try {
      for (let row = await nextTask(); row !== undefined; row = await nextTask()) {
        // oxlint-disable-next-line eslint/no-await-in-loop
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- one chapter at a time is the download queue's whole contract
        currentTask = process(row);
        await currentTask;
        currentTask = null;
      }
    } finally {
      running = false;
      if (wakeRequested) {
        wakeRequested = false;
        void pump();
      }
    }
  }

  async function startOne(chapterId: ChapterId, retryFailed: boolean): Promise<void> {
    const existing = await getDownload(db, chapterId);
    if (
      existing !== undefined &&
      (existing.status === 'queued' ||
        existing.status === 'downloading' ||
        (existing.status === 'complete' && !retryFailed))
    ) {
      return;
    }

    const source = await deps.readChapter(chapterId);
    if (source === undefined) {
      throw new Error('Chapter not found.');
    }
    const providerId = providerIdFor(source.chapter, existing?.providerId ?? source.providerId);
    if (providerId.length === 0) {
      throw new Error('This chapter has no provider to download from.');
    }

    await upsertDownload(db, {
      chapterId,
      mangaId: source.chapter.mangaId,
      providerId,
      status: 'queued',
      pageCount: source.chapter.pages.length,
      completedPages: existing?.completedPages ?? 0,
      failedPageIndexes: [],
      attempts: existing?.attempts ?? 0,
      lastErrorCode: null,
    });
    changed();
    void pump();
  }

  return {
    start() {
      if (started) return;
      started = true;
      void pump();
    },
    subscribe(listener) {
      listeners.add(listener);
      // React subscribes from an effect, so resuming here is not a render side effect.
      if (!started) {
        started = true;
        void pump();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    async enqueue(chapterId) {
      await startOne(chapterId, false);
    },
    async retry(chapterId) {
      await startOne(chapterId, true);
    },
    async cancel(chapterId) {
      const row = await getDownload(db, chapterId);
      if (row === undefined) return;
      await updateDownloadState(db, chapterId, {
        status: 'cancelled',
        lastErrorCode: 'user-cancelled',
      });
      if (current?.chapterId === chapterId) {
        current.controller.abort();
        await currentTask?.catch(() => undefined);
      }
      changed();
    },
    async remove(chapterId) {
      if (current?.chapterId === chapterId) {
        current.controller.abort();
        await currentTask?.catch(() => undefined);
      }
      const row = await getDownload(db, chapterId);
      if (row === undefined) return { removedPages: 0, removedBytes: 0 };
      const usage = await summarizeDownloadCache(db);
      const chapterUsage = usage.byChapter.find((entry) => entry.chapterId === chapterId);
      const removed = await removeChapterPageEntries(db, adapter, {
        providerId: row.providerId,
        mangaId: row.mangaId,
        chapterId,
      });
      await removeDownload(db, chapterId);
      changed();
      return {
        removedPages: chapterUsage?.pages ?? removed.removedEntries,
        removedBytes: chapterUsage?.bytes ?? removed.removedBytes,
      };
    },
  };
}
