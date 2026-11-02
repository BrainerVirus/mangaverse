import type { AppDrizzleDb } from '@app/db';
import type { QueryClient } from '@tanstack/react-query';
import { toMangaId, type MangaId } from '@app/shared';
import { z } from 'zod';

import { libraryQueryKeys, type MangaDetailData } from '@/features/library';

/**
 * Pending provider refreshes live in one app-settings row, not a table.
 *
 * #220 owns database schema changes, so this queue deliberately uses the
 * generic key/value settings repository: a versioned document that survives a
 * reload without a migration.
 */
export const MANGA_REFRESH_QUEUE_KEY = 'library.manga-refresh-queue';

const MANGA_REFRESH_QUEUE_VERSION = 1 as const;

/** A reload must never replay an unbounded backlog. */
export const MAX_MANGA_REFRESH_JOBS = 100;

/** Five attempts per session boundary; a user action resets them. */
const MAX_MANGA_REFRESH_ATTEMPTS = 5;

const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 30 * 60_000;

export type MangaRefreshReason = 'detail' | 'add';

export interface MangaRefreshJob {
  readonly mangaId: MangaId;
  readonly reason: MangaRefreshReason;
  readonly enqueuedAt: string;
  readonly attempts: number;
  readonly nextAttemptAt?: string;
  readonly exhausted?: boolean;
}

interface MangaRefreshQueueDocument {
  readonly version: typeof MANGA_REFRESH_QUEUE_VERSION;
  readonly jobs: readonly MangaRefreshJob[];
}

const jobSchema = z.object({
  mangaId: z.string().min(1),
  reason: z.enum(['detail', 'add']),
  enqueuedAt: z.string().min(1),
  attempts: z.number().int().min(0).max(1_000),
  nextAttemptAt: z.string().min(1).optional(),
  exhausted: z.boolean().optional(),
});

const queueSchema = z.object({
  version: z.literal(MANGA_REFRESH_QUEUE_VERSION),
  jobs: z.array(jobSchema),
});

/** Exponential backoff, capped so a long outage never parks a job for a day. */
export function mangaRefreshBackoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
}

function parseQueue(value: unknown): readonly MangaRefreshJob[] {
  const parsed = queueSchema.safeParse(value);
  if (!parsed.success) return [];
  // Keep the newest bounded window; older work was superseded anyway.
  return parsed.data.jobs.slice(-MAX_MANGA_REFRESH_JOBS).map((job) => ({
    mangaId: toMangaId(job.mangaId),
    reason: job.reason,
    enqueuedAt: job.enqueuedAt,
    attempts: job.attempts,
    ...(job.nextAttemptAt === undefined ? {} : { nextAttemptAt: job.nextAttemptAt }),
    ...(job.exhausted === undefined ? {} : { exhausted: job.exhausted }),
  }));
}

async function readStoredQueue(db: AppDrizzleDb): Promise<readonly MangaRefreshJob[]> {
  const { getAppSetting } = await import('@app/db');
  return parseQueue(await getAppSetting(db, MANGA_REFRESH_QUEUE_KEY));
}

async function writeQueue(db: AppDrizzleDb, jobs: readonly MangaRefreshJob[]): Promise<void> {
  const { upsertAppSetting } = await import('@app/db');
  const document: MangaRefreshQueueDocument = {
    version: MANGA_REFRESH_QUEUE_VERSION,
    jobs: jobs.slice(-MAX_MANGA_REFRESH_JOBS),
  };
  await upsertAppSetting(db, MANGA_REFRESH_QUEUE_KEY, document);
}

/**
 * One queue document per database handle. Every read-modify-write runs behind
 * this chain so a detail-open enqueue cannot lose the job a drain is retiring.
 */
const queueLocks = new WeakMap<AppDrizzleDb, Promise<unknown>>();

function withQueueLock<T>(db: AppDrizzleDb, work: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(db) ?? Promise.resolve();
  const next = previous.then(work, work);
  queueLocks.set(
    db,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/** The persisted queue, oldest job first. Invalid or older documents read as empty. */
export async function readMangaRefreshQueue(db: AppDrizzleDb): Promise<readonly MangaRefreshJob[]> {
  return readStoredQueue(db);
}

export async function hasMangaRefreshJob(db: AppDrizzleDb, mangaId: MangaId): Promise<boolean> {
  return (await readStoredQueue(db)).some((job) => job.mangaId === mangaId);
}

/**
 * Adds one job per manga. A repeat enqueue keeps the original position and
 * attempt count, so opening a title again cannot reset an active backoff. An
 * exhausted job is retried because a user visiting the title is a new signal.
 */
export async function enqueueMangaRefresh(
  db: AppDrizzleDb,
  mangaId: MangaId,
  reason: MangaRefreshReason,
  now: () => number = Date.now,
): Promise<void> {
  await withQueueLock(db, async () => {
    const jobs = await readStoredQueue(db);
    const existing = jobs.find((job) => job.mangaId === mangaId);
    if (existing !== undefined) {
      const next = jobs.map((job) => {
        if (job.mangaId !== mangaId) return job;
        if (job.exhausted === true) {
          // A user opening the title again is a fresh chance; drop the retry state.
          return { mangaId, reason, enqueuedAt: job.enqueuedAt, attempts: 0 };
        }
        return { ...job, reason };
      });
      await writeQueue(db, next);
      return;
    }

    const job: MangaRefreshJob = {
      mangaId,
      reason,
      enqueuedAt: new Date(now()).toISOString(),
      attempts: 0,
    };
    await writeQueue(db, [...jobs, job]);
  });
}

type MangaRefreshFn = (
  db: AppDrizzleDb,
  mangaId: MangaId,
  signal?: AbortSignal,
) => Promise<MangaDetailData | null>;

export interface DrainMangaRefreshOptions {
  /** Restrict the drain, e.g. to the title whose page just opened. */
  readonly mangaId?: MangaId;
  readonly signal?: AbortSignal;
  /** Startup and reconnect bypass stored backoff; a reload is a fresh chance. */
  readonly force?: boolean;
}

export interface MangaRefreshQueueDeps {
  readonly refresh?: MangaRefreshFn;
  readonly now?: () => number;
  readonly log?: (error: unknown) => void;
}

async function refreshMangaDetailFromProvider(
  db: AppDrizzleDb,
  mangaId: MangaId,
  signal?: AbortSignal,
): Promise<MangaDetailData | null> {
  const [{ fetchMangaDetail }, { getBindingForMangaId }, { fetchProviderMangaDetail }] =
    await Promise.all([
      import('@/features/library'),
      import('./provider-registry.js'),
      import('../queries/provider-query-options.js'),
    ]);

  const local = await fetchMangaDetail(db, mangaId);
  const binding = getBindingForMangaId(mangaId);
  if (binding === null) return null;
  return fetchProviderMangaDetail(db, binding, mangaId, local, signal);
}

/** Logs through the app's existing feedback/event log; a log failure never blocks the queue. */
function logRefreshFailure(error: unknown): void {
  void import('./app-feedback.js')
    .then(({ feedback }) => feedback.log(error, 'manga refresh queue'))
    .catch(() => undefined);
}

type RefreshOutcome =
  | { readonly ok: true; readonly refreshed: MangaDetailData | null }
  | { readonly ok: false; readonly error: unknown };

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** One provider call at a time per database; enqueues may interleave between calls. */
const activeDrains = new WeakMap<AppDrizzleDb, Promise<void>>();

async function retireRefreshedJob(
  db: AppDrizzleDb,
  queryClient: QueryClient,
  mangaId: MangaId,
  refreshed: MangaDetailData | null,
): Promise<void> {
  await withQueueLock(db, async () => {
    const jobs = await readStoredQueue(db);
    await writeQueue(
      db,
      jobs.filter((job) => job.mangaId !== mangaId),
    );
  });

  if (refreshed === null) return;
  if (queryClient.getQueryState(libraryQueryKeys.detail(mangaId)) !== undefined) {
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), refreshed);
  }
  // The library badge and card changed with the persisted chapters. Mark stale
  // without pulling every open query back into the network.
  void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all, refetchType: 'none' });
}

async function recordRefreshFailure(
  db: AppDrizzleDb,
  mangaId: MangaId,
  error: unknown,
  now: () => number,
  log: (error: unknown) => void,
): Promise<void> {
  await withQueueLock(db, async () => {
    const jobs = await readStoredQueue(db);
    const current = jobs.find((job) => job.mangaId === mangaId);
    // The job was retired elsewhere while the provider call ran; nothing to update.
    if (current === undefined) return;

    const attempts = current.attempts + 1;
    const nextAttemptAt = new Date(now() + mangaRefreshBackoffMs(attempts)).toISOString();
    await writeQueue(
      db,
      jobs.map((job) =>
        job.mangaId !== mangaId
          ? job
          : {
              ...job,
              attempts,
              nextAttemptAt,
              ...(attempts >= MAX_MANGA_REFRESH_ATTEMPTS ? { exhausted: true } : {}),
            },
      ),
    );
  });
  log(error);
}

async function runDrain(
  db: AppDrizzleDb,
  queryClient: QueryClient,
  options: DrainMangaRefreshOptions,
  deps: MangaRefreshQueueDeps,
): Promise<void> {
  const now = deps.now ?? Date.now;
  const refresh = deps.refresh ?? refreshMangaDetailFromProvider;
  const log = deps.log ?? logRefreshFailure;

  // The snapshot only chooses work; every write re-reads under the queue lock,
  // so a job enqueued during a provider call is never lost.
  const jobs = await readStoredQueue(db);

  for (const job of jobs) {
    if (isAborted(options.signal)) return;
    if (options.mangaId !== undefined && job.mangaId !== options.mangaId) continue;
    if (options.force !== true) {
      if (job.exhausted === true) continue;
      if (job.nextAttemptAt !== undefined && Date.parse(job.nextAttemptAt) > now()) continue;
    }

    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- the queue drains one provider call at a time so rate limits and per-job backoff stay honest
    const outcome = await refresh(db, job.mangaId, options.signal).then(
      (refreshed): RefreshOutcome => ({ ok: true, refreshed }),
      (error: unknown): RefreshOutcome => ({ ok: false, error }),
    );

    // An aborted run owns no state change: the job stays exactly as it was.
    if (isAborted(options.signal)) return;

    if (outcome.ok) {
      await retireRefreshedJob(db, queryClient, job.mangaId, outcome.refreshed);
    } else {
      await recordRefreshFailure(db, job.mangaId, outcome.error, now, log);
    }
  }
}

/**
 * Drains due jobs from the persisted queue. A provider failure is logged and
 * leaves the job in place with backoff; success removes it. Drains are
 * serialized per database, so a reload and a page open cannot double-call,
 * while an enqueue only waits for the short settings write, not the network.
 */
export async function drainMangaRefreshQueue(
  db: AppDrizzleDb,
  queryClient: QueryClient,
  options: DrainMangaRefreshOptions = {},
  deps: MangaRefreshQueueDeps = {},
): Promise<void> {
  const previous = activeDrains.get(db) ?? Promise.resolve();
  const run = previous.then(
    () => runDrain(db, queryClient, options, deps),
    () => runDrain(db, queryClient, options, deps),
  );
  activeDrains.set(
    db,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  await run;
}

/**
 * Startup/reconnect seam. Called from the local-database open effect, so the
 * queue needs no React effect of its own.
 */
export function startMangaRefreshQueue(db: AppDrizzleDb, queryClient: QueryClient): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onOnline = () => {
    void drainMangaRefreshQueue(db, queryClient, { force: true }).catch(() => undefined);
  };
  globalThis.addEventListener('online', onOnline);
  onOnline();

  return () => {
    globalThis.removeEventListener('online', onOnline);
  };
}
