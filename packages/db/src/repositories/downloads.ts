import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { chapters, downloads, mangaIdentities } from '../schema.js';

/** The lifecycle of one explicit chapter download (#222, spec 06 O6/O8). */
export const DOWNLOAD_STATUSES = [
  'queued',
  'downloading',
  'complete',
  'failed',
  'partial',
  'cancelled',
] as const;

export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

const DOWNLOAD_STATUS_SET: ReadonlySet<string> = new Set(DOWNLOAD_STATUSES);

/** Statuses a startup or queue pass treats as unfinished work. */
const ACTIVE_STATUSES: readonly DownloadStatus[] = ['queued', 'downloading'];

function isDownloadStatus(value: string): value is DownloadStatus {
  return DOWNLOAD_STATUS_SET.has(value);
}

export interface DownloadRecord {
  readonly chapterId: string;
  readonly mangaId: string;
  readonly providerId: string;
  readonly status: DownloadStatus;
  readonly pageCount: number;
  readonly completedPages: number;
  readonly failedPageIndexes: readonly number[];
  readonly attempts: number;
  readonly lastErrorCode?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

/** A download row with the labels the Storage surface lists it by. */
export interface DownloadDetail extends DownloadRecord {
  readonly chapterTitle?: string;
  readonly chapterIndex?: number;
  readonly mangaTitle?: string;
}

export interface DownloadWriteInput {
  readonly chapterId: string;
  readonly mangaId: string;
  readonly providerId: string;
  readonly status: DownloadStatus;
  readonly pageCount?: number;
  readonly completedPages?: number;
  readonly failedPageIndexes?: readonly number[];
  readonly attempts?: number;
  readonly lastErrorCode?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
}

export interface DownloadStatePatch {
  readonly status?: DownloadStatus;
  readonly pageCount?: number;
  readonly completedPages?: number;
  readonly failedPageIndexes?: readonly number[];
  readonly attempts?: number;
  readonly lastErrorCode?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
}

interface DownloadRowShape {
  readonly chapterId: string;
  readonly mangaId: string;
  readonly providerId: string;
  readonly status: string;
  readonly pageCount: number | null;
  readonly completedPages: number | null;
  readonly failedPageIndexesJson: number[] | null;
  readonly attempts: number | null;
  readonly lastErrorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

function mapDownloadRow(row: DownloadRowShape): DownloadRecord {
  return {
    chapterId: row.chapterId,
    mangaId: row.mangaId,
    providerId: row.providerId,
    // A status written by a newer app is not trusted; it reads as failed and can be retried.
    status: isDownloadStatus(row.status) ? row.status : 'failed',
    pageCount: row.pageCount ?? 0,
    completedPages: row.completedPages ?? 0,
    failedPageIndexes: Array.isArray(row.failedPageIndexesJson)
      ? row.failedPageIndexesJson.filter((index): index is number => Number.isInteger(index))
      : [],
    attempts: row.attempts ?? 0,
    ...(row.lastErrorCode !== null && row.lastErrorCode !== ''
      ? { lastErrorCode: row.lastErrorCode }
      : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.startedAt !== null && row.startedAt !== '' ? { startedAt: row.startedAt } : {}),
    ...(row.completedAt !== null && row.completedAt !== '' ? { completedAt: row.completedAt } : {}),
  };
}

/** One row per chapter. A second call replaces the row's state but keeps its creation time. */
export async function upsertDownload(
  db: AppDrizzleDb,
  input: DownloadWriteInput,
): Promise<DownloadRecord> {
  const now = new Date().toISOString();
  const values = {
    chapterId: input.chapterId,
    mangaId: input.mangaId,
    providerId: input.providerId,
    status: input.status,
    pageCount: input.pageCount ?? 0,
    completedPages: input.completedPages ?? 0,
    failedPageIndexesJson: [...(input.failedPageIndexes ?? [])],
    attempts: input.attempts ?? 0,
    lastErrorCode: input.lastErrorCode ?? null,
    createdAt: now,
    updatedAt: now,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
  };

  await db
    .insert(downloads)
    .values(values)
    .onConflictDoUpdate({
      target: downloads.chapterId,
      set: {
        mangaId: values.mangaId,
        providerId: values.providerId,
        status: values.status,
        pageCount: values.pageCount,
        completedPages: values.completedPages,
        failedPageIndexesJson: values.failedPageIndexesJson,
        attempts: values.attempts,
        lastErrorCode: values.lastErrorCode,
        updatedAt: values.updatedAt,
        startedAt: values.startedAt,
        completedAt: values.completedAt,
      },
    });

  const row = db.select().from(downloads).where(eq(downloads.chapterId, input.chapterId)).get();
  // The insert or update just ran against this primary key.
  return mapDownloadRow(row!);
}

/** A partial write for a cancel or a status-only change; unchanged fields stay put. */
export async function updateDownloadState(
  db: AppDrizzleDb,
  chapterId: string,
  patch: DownloadStatePatch,
): Promise<DownloadRecord | undefined> {
  const set: {
    status?: DownloadStatus;
    pageCount?: number;
    completedPages?: number;
    failedPageIndexesJson?: number[];
    attempts?: number;
    lastErrorCode?: string | null;
    updatedAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
  } = { updatedAt: new Date().toISOString() };

  if (patch.status !== undefined) set.status = patch.status;
  if (patch.pageCount !== undefined) set.pageCount = patch.pageCount;
  if (patch.completedPages !== undefined) set.completedPages = patch.completedPages;
  if (patch.failedPageIndexes !== undefined) {
    set.failedPageIndexesJson = [...patch.failedPageIndexes];
  }
  if (patch.attempts !== undefined) set.attempts = patch.attempts;
  if (patch.lastErrorCode !== undefined) set.lastErrorCode = patch.lastErrorCode;
  if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
  if (patch.completedAt !== undefined) set.completedAt = patch.completedAt;

  await db.update(downloads).set(set).where(eq(downloads.chapterId, chapterId));
  return getDownload(db, chapterId);
}

export async function getDownload(
  db: AppDrizzleDb,
  chapterId: string,
): Promise<DownloadRecord | undefined> {
  const row = db.select().from(downloads).where(eq(downloads.chapterId, chapterId)).get();
  return row === undefined ? undefined : mapDownloadRow(row);
}

/** Every download of a title, newest first, for the chapter list's per-row state. */
export async function listDownloadsForManga(
  db: AppDrizzleDb,
  mangaId: string,
): Promise<DownloadRecord[]> {
  const rows = db
    .select()
    .from(downloads)
    .where(eq(downloads.mangaId, mangaId))
    .orderBy(desc(downloads.updatedAt))
    .all();
  return rows.map(mapDownloadRow);
}

export async function listDownloads(db: AppDrizzleDb): Promise<DownloadRecord[]> {
  const rows = db.select().from(downloads).orderBy(desc(downloads.updatedAt)).all();
  return rows.map(mapDownloadRow);
}

/** Downloads still waiting for pages: what a startup pass resumes. */
export async function listActiveDownloads(db: AppDrizzleDb): Promise<DownloadRecord[]> {
  const rows = db
    .select()
    .from(downloads)
    .where(inArray(downloads.status, [...ACTIVE_STATUSES]))
    .orderBy(asc(downloads.createdAt))
    .all();
  return rows.map(mapDownloadRow);
}

/** The Storage list: each download, its chapter title and its title, newest first. */
export async function listDownloadDetails(db: AppDrizzleDb): Promise<DownloadDetail[]> {
  const rows = db
    .select({
      chapterId: downloads.chapterId,
      mangaId: downloads.mangaId,
      providerId: downloads.providerId,
      status: downloads.status,
      pageCount: downloads.pageCount,
      completedPages: downloads.completedPages,
      failedPageIndexesJson: downloads.failedPageIndexesJson,
      attempts: downloads.attempts,
      lastErrorCode: downloads.lastErrorCode,
      createdAt: downloads.createdAt,
      updatedAt: downloads.updatedAt,
      startedAt: downloads.startedAt,
      completedAt: downloads.completedAt,
      chapterTitle: chapters.title,
      chapterIndex: chapters.chapterIndex,
      mangaTitle: mangaIdentities.canonicalTitle,
    })
    .from(downloads)
    .leftJoin(chapters, eq(chapters.id, downloads.chapterId))
    .leftJoin(mangaIdentities, eq(mangaIdentities.id, downloads.mangaId))
    .orderBy(desc(downloads.updatedAt))
    .all();

  return rows.map((row) => ({
    ...mapDownloadRow(row),
    ...(row.chapterTitle !== null && row.chapterTitle !== undefined
      ? { chapterTitle: row.chapterTitle }
      : {}),
    ...(row.chapterIndex !== null && row.chapterIndex !== undefined
      ? { chapterIndex: row.chapterIndex }
      : {}),
    ...(row.mangaTitle !== null && row.mangaTitle !== undefined
      ? { mangaTitle: row.mangaTitle }
      : {}),
  }));
}

/** Removes the download row only; the caller deletes the page blobs and rows first. */
export async function removeDownload(
  db: AppDrizzleDb,
  chapterId: string,
): Promise<DownloadRecord | undefined> {
  const row = await getDownload(db, chapterId);
  if (row === undefined) return undefined;
  await db.delete(downloads).where(eq(downloads.chapterId, chapterId));
  return row;
}
