import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { cacheEntries } from '../schema.js';

export interface CacheStorageSummary {
  readonly totalCount: number;
  readonly totalBytes: number;
  readonly byProvider: readonly {
    readonly providerId: string;
    readonly count: number;
    readonly bytes: number;
  }[];
}

export interface CacheEntryRecord {
  readonly id: string;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId?: string;
  readonly cacheKind: string;
  readonly lastAccessAt: string;
  readonly sourceUrl?: string;
  readonly mimeType?: string;
  readonly byteSize: number;
  readonly blobKey?: string;
  readonly metadata?: Record<string, unknown> | null;
}

function mapCacheRow(r: typeof cacheEntries.$inferSelect): CacheEntryRecord {
  return {
    id: r.id,
    providerId: r.providerId,
    mangaId: r.mangaId,
    ...(r.chapterId !== null && r.chapterId !== undefined && r.chapterId !== ''
      ? { chapterId: r.chapterId }
      : {}),
    cacheKind: r.cacheKind,
    lastAccessAt: r.lastAccessAt,
    ...(r.sourceUrl !== null && r.sourceUrl !== undefined && r.sourceUrl !== ''
      ? { sourceUrl: r.sourceUrl }
      : {}),
    ...(r.mimeType !== null && r.mimeType !== undefined && r.mimeType !== ''
      ? { mimeType: r.mimeType }
      : {}),
    byteSize: r.byteSize ?? 0,
    ...(r.blobKey !== null && r.blobKey !== undefined && r.blobKey !== ''
      ? { blobKey: r.blobKey }
      : {}),
    ...(r.metadataJson !== null && r.metadataJson !== undefined
      ? { metadata: r.metadataJson as Record<string, unknown> }
      : {}),
  };
}

export async function upsertCacheEntry(
  db: AppDrizzleDb,
  input: {
    readonly id?: string;
    readonly providerId: string;
    readonly mangaId: string;
    readonly chapterId?: string;
    readonly cacheKind: string;
    readonly sourceUrl?: string;
    readonly mimeType?: string;
    readonly byteSize?: number;
    readonly blobKey?: string;
    readonly metadata?: Record<string, unknown> | null;
  },
): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .insert(cacheEntries)
    .values({
      id,
      providerId: input.providerId,
      mangaId: input.mangaId,
      chapterId: input.chapterId,
      cacheKind: input.cacheKind,
      lastAccessAt: now,
      sourceUrl: input.sourceUrl,
      mimeType: input.mimeType,
      byteSize: input.byteSize ?? 0,
      blobKey: input.blobKey,
      metadataJson: input.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: cacheEntries.id,
      set: {
        lastAccessAt: now,
        metadataJson: input.metadata ?? null,
        chapterId: input.chapterId,
        cacheKind: input.cacheKind,
        sourceUrl: input.sourceUrl,
        mimeType: input.mimeType,
        byteSize: input.byteSize ?? 0,
        blobKey: input.blobKey,
      },
    });
  return id;
}

export async function touchCacheEntry(db: AppDrizzleDb, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(cacheEntries).set({ lastAccessAt: now }).where(eq(cacheEntries.id, id));
}

export async function getCacheEntryById(
  db: AppDrizzleDb,
  id: string,
): Promise<CacheEntryRecord | undefined> {
  const row = await db.select().from(cacheEntries).where(eq(cacheEntries.id, id)).get();
  return row === undefined ? undefined : mapCacheRow(row);
}

export async function getCacheEntryByKey(
  db: AppDrizzleDb,
  input: {
    readonly providerId: string;
    readonly mangaId: string;
    readonly cacheKind: string;
    readonly chapterId?: string;
  },
): Promise<CacheEntryRecord | undefined> {
  const conditions = [
    eq(cacheEntries.providerId, input.providerId),
    eq(cacheEntries.mangaId, input.mangaId),
    eq(cacheEntries.cacheKind, input.cacheKind),
  ];

  if (input.chapterId !== undefined) {
    conditions.push(eq(cacheEntries.chapterId, input.chapterId));
  }

  const row = await db
    .select()
    .from(cacheEntries)
    .where(and(...conditions))
    .orderBy(desc(cacheEntries.lastAccessAt))
    .get();

  return row === undefined ? undefined : mapCacheRow(row);
}

export async function listCacheEntriesForManga(
  db: AppDrizzleDb,
  providerId: string,
  mangaId: string,
): Promise<CacheEntryRecord[]> {
  const rows = await db
    .select()
    .from(cacheEntries)
    .where(and(eq(cacheEntries.providerId, providerId), eq(cacheEntries.mangaId, mangaId)))
    .orderBy(desc(cacheEntries.lastAccessAt))
    .all();

  return rows.map(mapCacheRow);
}

export async function listCacheEntriesByKind(
  db: AppDrizzleDb,
  cacheKind: string,
): Promise<CacheEntryRecord[]> {
  const rows = await db
    .select()
    .from(cacheEntries)
    .where(eq(cacheEntries.cacheKind, cacheKind))
    .orderBy(asc(cacheEntries.lastAccessAt))
    .all();

  return rows.map(mapCacheRow);
}

export async function deleteCacheEntry(db: AppDrizzleDb, id: string): Promise<CacheEntryRecord | undefined> {
  const row = await db.select().from(cacheEntries).where(eq(cacheEntries.id, id)).get();
  if (row === undefined) {
    return undefined;
  }
  await db.delete(cacheEntries).where(eq(cacheEntries.id, id));
  return mapCacheRow(row);
}

export async function summarizeCacheStorage(db: AppDrizzleDb): Promise<CacheStorageSummary> {
  const rows = await db
    .select({
      providerId: cacheEntries.providerId,
      count: sql<number>`count(*)`.mapWith(Number),
      bytes: sql<number>`coalesce(sum(${cacheEntries.byteSize}), 0)`.mapWith(Number),
    })
    .from(cacheEntries)
    .groupBy(cacheEntries.providerId)
    .all();

  const byProvider = rows
    .map((row) => ({ providerId: row.providerId, count: row.count, bytes: row.bytes }))
    .sort((left, right) => right.bytes - left.bytes);
  const totalCount = byProvider.reduce((sum, row) => sum + row.count, 0);
  const totalBytes = byProvider.reduce((sum, row) => sum + row.bytes, 0);

  return { totalCount, totalBytes, byProvider };
}

export async function clearAllCacheEntries(db: AppDrizzleDb): Promise<number> {
  const rows = await db.select({ id: cacheEntries.id }).from(cacheEntries).all();
  if (rows.length === 0) {
    return 0;
  }

  await db.delete(cacheEntries);
  return rows.length;
}
