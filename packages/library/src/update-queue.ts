import type { AppDrizzleDb } from '@app/db';
import type { LibraryEntryId, MangaId, ProviderId, ProviderMappingId } from '@app/shared';

/** The last completed update check lives in one app-settings row, not a table. */
export const LIBRARY_UPDATE_REPORT_KEY = 'library.update-report';

/** One provider chapter, structurally compatible with the extension SDK's value. */
export interface LibraryUpdateProviderChapter {
  readonly id: string;
  readonly title: string;
  readonly index: number;
  readonly publishedAt?: string;
}

export interface LibraryUpdateProvider {
  /** Spacing the queue keeps between this provider's calls (rate limit budget). */
  readonly requestIntervalMs?: number;
  listChapters(
    providerMangaId: string,
    options: { readonly signal: AbortSignal },
  ): Promise<readonly LibraryUpdateProviderChapter[]>;
}

export type LibraryUpdateProviderResolution =
  | { readonly status: 'available'; readonly provider: LibraryUpdateProvider }
  | { readonly status: 'unavailable'; readonly reason: string };

/**
 * Resolves a provider the queue may call. The app owns this seam so the library
 * package never imports provider runtime; unavailable covers not installed,
 * disabled, unsupported and missing capabilities, each with a display reason.
 */
export type LibraryUpdateProviderResolver = (
  providerId: ProviderId,
) => Promise<LibraryUpdateProviderResolution>;

export type LibraryUpdateItemStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface LibraryUpdateItem {
  readonly entryId: LibraryEntryId;
  readonly mangaId: MangaId;
  readonly title: string;
  readonly providerId?: ProviderId;
  readonly status: LibraryUpdateItemStatus;
  readonly newChapterCount: number;
  readonly updatedChapterCount: number;
  readonly unreadCount: number;
  /** Why a title was skipped or failed; never set for a completed check. */
  readonly reason?: string;
}

export interface LibraryUpdateReport {
  readonly status: 'running' | 'done' | 'cancelled';
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly items: readonly LibraryUpdateItem[];
}

export interface RunLibraryUpdateOptions {
  readonly resolveProvider: LibraryUpdateProviderResolver;
  /** Restrict the run, e.g. to retry one failed title. */
  readonly entryIds?: readonly LibraryEntryId[];
  readonly signal?: AbortSignal;
  /** Bounded fan-out; defaults to 2 so a large library never floods a provider. */
  readonly concurrency?: number;
  readonly onProgress?: (report: LibraryUpdateReport) => void;
  readonly now?: () => string;
}

const DEFAULT_CONCURRENCY = 2;
const ITEM_STATUSES = new Set<LibraryUpdateItemStatus>([
  'queued',
  'running',
  'done',
  'failed',
  'skipped',
  'cancelled',
]);

function errorMessage(caught: unknown): string {
  return caught instanceof Error && caught.message.length > 0
    ? caught.message
    : 'Provider request failed.';
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Spaces calls per provider. The slot is reserved when the call is scheduled,
 * not when it starts, so two workers cannot both claim the same gap.
 */
function scheduledDelay(
  lastCallAt: Map<ProviderId, number>,
  providerId: ProviderId,
  intervalMs: number,
): number {
  if (intervalMs <= 0) return 0;
  const now = Date.now();
  const start = Math.max(now, (lastCallAt.get(providerId) ?? 0) + intervalMs);
  lastCallAt.set(providerId, start);
  return start - now;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseReport(value: unknown): LibraryUpdateReport | undefined {
  if (!isRecord(value) || !Array.isArray(value['items'])) return undefined;
  if (
    value['status'] !== 'running' &&
    value['status'] !== 'done' &&
    value['status'] !== 'cancelled'
  ) {
    return undefined;
  }
  const items: LibraryUpdateItem[] = [];
  for (const raw of value['items']) {
    if (!isRecord(raw)) return undefined;
    const status = raw['status'];
    if (typeof status !== 'string' || !ITEM_STATUSES.has(status as LibraryUpdateItemStatus)) {
      return undefined;
    }
    if (
      typeof raw['entryId'] !== 'string' ||
      typeof raw['mangaId'] !== 'string' ||
      typeof raw['title'] !== 'string'
    ) {
      return undefined;
    }
    items.push({
      entryId: raw['entryId'] as LibraryEntryId,
      mangaId: raw['mangaId'] as MangaId,
      title: raw['title'],
      ...(typeof raw['providerId'] === 'string'
        ? { providerId: raw['providerId'] as ProviderId }
        : {}),
      status: status as LibraryUpdateItemStatus,
      newChapterCount: typeof raw['newChapterCount'] === 'number' ? raw['newChapterCount'] : 0,
      updatedChapterCount:
        typeof raw['updatedChapterCount'] === 'number' ? raw['updatedChapterCount'] : 0,
      unreadCount: typeof raw['unreadCount'] === 'number' ? raw['unreadCount'] : 0,
      ...(typeof raw['reason'] === 'string' ? { reason: raw['reason'] } : {}),
    });
  }
  const startedAt = typeof value['startedAt'] === 'string' ? value['startedAt'] : '';
  const finishedAt = typeof value['finishedAt'] === 'string' ? value['finishedAt'] : undefined;
  const status = value['status'];
  // A report still "running" was interrupted by a reload: say so instead of
  // leaving a check that never finishes on screen.
  const interrupted = status === 'running';
  return {
    status: interrupted ? 'cancelled' : status,
    startedAt,
    ...(finishedAt === undefined ? {} : { finishedAt }),
    items: interrupted
      ? items.map((item) =>
          item.status === 'queued' || item.status === 'running'
            ? { ...item, status: 'cancelled' as const, reason: 'Interrupted before it finished.' }
            : item,
        )
      : items,
  };
}

/** The last persisted check, normalized so an interrupted run reads as cancelled. */
export async function readLibraryUpdateReport(
  db: AppDrizzleDb,
): Promise<LibraryUpdateReport | undefined> {
  const { getAppSetting } = await import('@app/db');
  const stored = await getAppSetting(db, LIBRARY_UPDATE_REPORT_KEY);
  return parseReport(stored);
}

async function persistReport(db: AppDrizzleDb, report: LibraryUpdateReport): Promise<void> {
  const { upsertAppSetting } = await import('@app/db');
  try {
    await upsertAppSetting(db, LIBRARY_UPDATE_REPORT_KEY, report);
  } catch {
    // The in-memory report is still shown; reload keeps the previous one.
  }
}

/** Removes the stored report; a reload then has nothing to show. */
export async function clearLibraryUpdateReport(db: AppDrizzleDb): Promise<void> {
  const { deleteAppSetting } = await import('@app/db');
  await deleteAppSetting(db, LIBRARY_UPDATE_REPORT_KEY);
}

interface QueueJob {
  readonly entryId: LibraryEntryId;
  readonly title: string;
  readonly mangaId: MangaId;
  readonly providerId: ProviderId;
  readonly providerMangaId: string;
  readonly mappingId: ProviderMappingId;
  readonly provider: LibraryUpdateProvider;
}

/**
 * Checks every selected library title against its active provider mapping.
 * Titles are independent: a provider failure is recorded for that title and the
 * run continues. Chapters are persisted without touching cached pages, and the
 * unread count is recomputed from the new chapter set.
 */
export async function runLibraryUpdateQueue(
  db: AppDrizzleDb,
  options: RunLibraryUpdateOptions,
): Promise<LibraryUpdateReport> {
  const { getMangaIdentities, listLibraryEntries } = await import('@app/db');
  const now = options.now ?? (() => new Date().toISOString());
  const signal = options.signal ?? new AbortController().signal;
  const startedAt = now();

  const wantedIds = options.entryIds === undefined ? undefined : new Set(options.entryIds);
  const entries = (await listLibraryEntries(db)).filter(
    (entry) => wantedIds === undefined || wantedIds.has(entry.id),
  );
  const identities = await getMangaIdentities(
    db,
    entries.map((entry) => entry.mangaId),
  );
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));

  let items: LibraryUpdateItem[] = entries.map((entry) => {
    const manga = identityById.get(entry.mangaId);
    return {
      entryId: entry.id,
      mangaId: entry.mangaId,
      title: manga?.canonicalTitle ?? entry.mangaId,
      status: 'queued',
      newChapterCount: 0,
      updatedChapterCount: 0,
      unreadCount: entry.unreadCount,
    };
  });

  const emit = (report: LibraryUpdateReport) => options.onProgress?.(report);
  const progress = (): LibraryUpdateReport => ({ status: 'running', startedAt, items });

  const setItem = (
    entryId: LibraryEntryId,
    patch: Partial<Omit<LibraryUpdateItem, 'entryId' | 'mangaId' | 'title'>>,
  ) => {
    items = items.map((item) => (item.entryId === entryId ? { ...item, ...patch } : item));
    emit(progress());
  };

  const jobs: QueueJob[] = [];
  const resolutions = new Map<ProviderId, Promise<LibraryUpdateProviderResolution>>();

  for (const entry of entries) {
    const manga = identityById.get(entry.mangaId);
    const mapping =
      manga?.providerMappings.find((candidate) => candidate.id === entry.activeProviderMappingId) ??
      manga?.providerMappings.find(
        (candidate) => candidate.id === manga.defaultProviderMappingId,
      ) ??
      manga?.providerMappings[0];
    if (manga === undefined || mapping === undefined) {
      setItem(entry.id, { status: 'skipped', reason: 'No provider mapping for this title.' });
      continue;
    }

    const providerId = mapping.providerId;
    let resolution = resolutions.get(providerId);
    if (resolution === undefined) {
      resolution = options.resolveProvider(providerId);
      resolutions.set(providerId, resolution);
    }
    let resolved: LibraryUpdateProviderResolution;
    try {
      resolved = await resolution;
    } catch (caught) {
      setItem(entry.id, { status: 'skipped', providerId, reason: errorMessage(caught) });
      continue;
    }
    if (resolved.status === 'unavailable') {
      setItem(entry.id, { status: 'skipped', providerId, reason: resolved.reason });
      continue;
    }

    jobs.push({
      entryId: entry.id,
      title: manga.canonicalTitle,
      mangaId: entry.mangaId,
      providerId,
      providerMangaId: String(mapping.providerMangaId),
      mappingId: mapping.id,
      provider: resolved.provider,
    });
  }

  const { listChapterHeadersForMapping, recomputeLibraryUnreadCounts, upsertChapterMetadata } =
    await import('@app/db');
  const lastCallAt = new Map<ProviderId, number>();

  const execute = async (job: QueueJob): Promise<void> => {
    if (signal.aborted) {
      setItem(job.entryId, { status: 'cancelled' });
      return;
    }
    setItem(job.entryId, { status: 'running', providerId: job.providerId });

    const delay = scheduledDelay(lastCallAt, job.providerId, job.provider.requestIntervalMs ?? 0);
    await sleep(delay, signal);
    if (signal.aborted) {
      setItem(job.entryId, { status: 'cancelled' });
      return;
    }

    try {
      const chapters = await job.provider.listChapters(job.providerMangaId, { signal });
      const entry = entries.find((candidate) => candidate.id === job.entryId);
      if (entry === undefined) {
        setItem(job.entryId, { status: 'cancelled' });
        return;
      }

      const existing = await listChapterHeadersForMapping(db, job.mappingId);
      const existingByIndex = new Map(existing.map((header) => [header.index, header]));
      let newChapterCount = 0;
      let updatedChapterCount = 0;

      for (const chapter of chapters) {
        const before = existingByIndex.get(chapter.index);
        const saved = await upsertChapterMetadata(db, {
          mangaId: job.mangaId,
          providerMappingId: job.mappingId,
          providerId: String(job.providerId),
          providerChapterId: chapter.id,
          title: chapter.title,
          index: chapter.index,
          ...(chapter.publishedAt === undefined ? {} : { publishedAt: chapter.publishedAt }),
        });
        if (!saved.ok) throw new Error(saved.error.message);
        if (before === undefined) {
          newChapterCount += 1;
        } else if (before.title !== chapter.title || before.publishedAt !== chapter.publishedAt) {
          updatedChapterCount += 1;
        }
      }

      const unread = await recomputeLibraryUnreadCounts(db, [entry]);
      setItem(job.entryId, {
        status: 'done',
        newChapterCount,
        updatedChapterCount,
        unreadCount: unread.get(entry.id) ?? entry.unreadCount,
      });
    } catch (caught) {
      if (signal.aborted) {
        setItem(job.entryId, { status: 'cancelled' });
        return;
      }
      setItem(job.entryId, { status: 'failed', reason: errorMessage(caught) });
    }
  };

  let cursor = 0;
  const workerCount = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, jobs.length),
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor];
        cursor += 1;
        if (job !== undefined) await execute(job);
      }
    }),
  );

  items = items.map((item) =>
    item.status === 'queued' || item.status === 'running'
      ? { ...item, status: 'cancelled' as const }
      : item,
  );

  // A retry only replaces the retried titles; the rest of the last report stays.
  if (wantedIds !== undefined) {
    const previous = await readLibraryUpdateReport(db);
    if (previous !== undefined) {
      const replaced = new Map(items.map((item) => [item.entryId, item]));
      const merged = previous.items.flatMap((item) => {
        const replacement = replaced.get(item.entryId);
        if (replacement !== undefined) return [replacement];
        // The retried title is gone from the library, so its old row can never
        // run again: drop it instead of leaving an un-retryable entry.
        return wantedIds.has(item.entryId) ? [] : [item];
      });
      items = [
        ...merged,
        ...items.filter((item) => !previous.items.some((old) => old.entryId === item.entryId)),
      ];
    }
  }

  const report: LibraryUpdateReport = {
    status: signal.aborted ? 'cancelled' : 'done',
    startedAt,
    finishedAt: now(),
    items,
  };
  await persistReport(db, report);
  emit(report);
  return report;
}
