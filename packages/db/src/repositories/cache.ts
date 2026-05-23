import { and, desc, eq } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { cacheEntries } from '../schema.js';

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
