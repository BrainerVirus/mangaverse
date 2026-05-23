import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { cacheEntries } from '../schema.js';

export interface CacheStorageSummary {
  readonly totalCount: number;
  readonly byProvider: readonly {
    readonly providerId: string;
    readonly count: number;
  }[];
}

export interface CacheEntryRecord {
  readonly id: string;
  readonly providerId: string;
  readonly mangaId: string;
  readonly chapterId?: string;
  readonly cacheKind: string;
  readonly lastAccessAt: string;
  readonly metadata?: Record<string, unknown> | null;
}

function newId(): string {
  return crypto.randomUUID();
}

export async function upsertCacheEntry(
  db: AppDrizzleDb,
  input: {
    readonly id?: string;
    readonly providerId: string;
    readonly mangaId: string;
    readonly chapterId?: string;
    readonly cacheKind: string;
    readonly metadata?: Record<string, unknown> | null;
  },
): Promise<string> {
  const id = input.id ?? newId();
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
      metadataJson: input.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: cacheEntries.id,
      set: {
        lastAccessAt: now,
        metadataJson: input.metadata ?? null,
        chapterId: input.chapterId,
        cacheKind: input.cacheKind,
      },
    });
  return id;
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

  return rows.map((r) => ({
    id: r.id,
    providerId: r.providerId,
    mangaId: r.mangaId,
    ...(r.chapterId !== null && r.chapterId !== undefined && r.chapterId !== '' ? { chapterId: r.chapterId } : {}),
    cacheKind: r.cacheKind,
    lastAccessAt: r.lastAccessAt,
    ...(r.metadataJson !== null && r.metadataJson !== undefined ? { metadata: r.metadataJson as Record<string, unknown> } : {}),
  }));
}

export async function summarizeCacheStorage(db: AppDrizzleDb): Promise<CacheStorageSummary> {
  const rows = await db
    .select({
      providerId: cacheEntries.providerId,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(cacheEntries)
    .groupBy(cacheEntries.providerId)
    .all();

  const byProvider = rows
    .map((row) => ({ providerId: row.providerId, count: row.count }))
    .sort((left, right) => right.count - left.count);
  const totalCount = byProvider.reduce((sum, row) => sum + row.count, 0);

  return { totalCount, byProvider };
}

export async function clearAllCacheEntries(db: AppDrizzleDb): Promise<number> {
  const rows = await db.select({ id: cacheEntries.id }).from(cacheEntries).all();
  if (rows.length === 0) {
    return 0;
  }

  await db.delete(cacheEntries);
  return rows.length;
}
