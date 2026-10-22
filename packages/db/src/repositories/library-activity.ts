import { eq, inArray } from 'drizzle-orm';
import type { ChapterId, LibraryEntry, LibraryEntryId, ProviderMappingId } from '@app/shared';
import { toChapterId, toProviderMappingId } from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { readIdChunks } from '../read-id-chunks.js';
import { withTransaction } from '../transactions.js';
import { chapterReadState, chapters, libraryEntries, mangaIdentities } from '../schema.js';

export interface LibraryChapterRef {
  readonly id: ChapterId;
  readonly providerMappingId: ProviderMappingId;
  readonly title: string;
  readonly index: number;
  /** When the provider released the chapter, when it says so. */
  readonly publishedAt?: string;
  /** First time the chapter was persisted; `updatedAt` is a sync stamp, not a change. */
  readonly addedAt?: string;
}

export interface LibraryChapterStats {
  readonly chapterCount: number;
  readonly unreadCount: number;
  readonly latestChapter?: LibraryChapterRef;
  readonly lastReadChapter?: LibraryChapterRef;
  readonly lastReadAt?: string;
}

interface ChapterRow {
  readonly id: string;
  readonly mangaId: string;
  readonly providerMappingId: string;
  readonly title: string;
  readonly index: number;
  readonly publishedAt: string | null;
  readonly createdAt: string | null;
}

function toChapterRef(row: ChapterRow): LibraryChapterRef {
  return {
    id: toChapterId(row.id),
    providerMappingId: toProviderMappingId(row.providerMappingId),
    title: row.title,
    index: row.index,
    ...(row.publishedAt !== null && row.publishedAt !== '' ? { publishedAt: row.publishedAt } : {}),
    ...(row.createdAt !== null && row.createdAt !== '' ? { addedAt: row.createdAt } : {}),
  };
}

function newestByIndex(rows: readonly ChapterRow[]): ChapterRow | undefined {
  return rows.reduce<ChapterRow | undefined>(
    (best, row) => (best === undefined || row.index > best.index ? row : best),
    undefined,
  );
}

/**
 * Live chapter stats for library entries, one grouped read instead of a query
 * per title. `unreadCount` counts chapters without a completed read state;
 * `lastReadAt` is the progress event time, so metadata edits cannot reorder
 * "continue reading".
 */
export async function getLibraryChapterStats(
  db: AppDrizzleDb,
  entries: readonly LibraryEntry[],
): Promise<Map<LibraryEntryId, LibraryChapterStats>> {
  const stats = new Map<LibraryEntryId, LibraryChapterStats>();
  if (entries.length === 0) return stats;

  const mangaIds = entries.map((entry) => entry.mangaId);
  const chapterRows = readIdChunks(mangaIds, (chunk) =>
    db
      .select({
        id: chapters.id,
        mangaId: chapters.mangaId,
        providerMappingId: chapters.providerMappingId,
        title: chapters.title,
        index: chapters.chapterIndex,
        publishedAt: chapters.publishedAt,
        createdAt: chapters.createdAt,
      })
      .from(chapters)
      .where(inArray(chapters.mangaId, chunk))
      .all(),
  );

  const readRows = readIdChunks(
    chapterRows.map((row) => row.id),
    (chunk) =>
      db
        .select({
          chapterId: chapterReadState.chapterId,
          completed: chapterReadState.completed,
          updatedAt: chapterReadState.updatedAt,
        })
        .from(chapterReadState)
        .where(inArray(chapterReadState.chapterId, chunk))
        .all(),
  );
  const readStateByChapterId = new Map(readRows.map((row) => [row.chapterId, row]));

  const defaultMappingByMangaId = new Map(
    readIdChunks(mangaIds, (chunk) =>
      db
        .select({
          id: mangaIdentities.id,
          defaultProviderMappingId: mangaIdentities.defaultProviderMappingId,
        })
        .from(mangaIdentities)
        .where(inArray(mangaIdentities.id, chunk))
        .all(),
    ).map((row) => [row.id, row.defaultProviderMappingId]),
  );

  const chaptersByMangaId = new Map<string, ChapterRow[]>();
  for (const row of chapterRows) {
    const list = chaptersByMangaId.get(row.mangaId);
    if (list === undefined) chaptersByMangaId.set(row.mangaId, [row]);
    else list.push(row);
  }

  for (const entry of entries) {
    const all = chaptersByMangaId.get(entry.mangaId) ?? [];
    const sourceMappingId =
      entry.activeProviderMappingId ?? defaultMappingByMangaId.get(entry.mangaId);
    // A freshly switched provider has no local chapters yet; fall back to every
    // mapping so the title still shows its known chapters instead of zero.
    const scoped = all.filter((row) => row.providerMappingId === sourceMappingId);
    const rows = scoped.length > 0 ? scoped : all;

    const latest = newestByIndex(rows);
    const lastReadChapter = all.find((row) => row.id === entry.lastReadChapterId);
    const readAt = all.reduce((max, row) => {
      const updatedAt = readStateByChapterId.get(row.id)?.updatedAt ?? '';
      return updatedAt > max ? updatedAt : max;
    }, '');

    stats.set(entry.id, {
      chapterCount: rows.length,
      unreadCount: rows.filter((row) => readStateByChapterId.get(row.id)?.completed !== true)
        .length,
      ...(latest === undefined ? {} : { latestChapter: toChapterRef(latest) }),
      ...(lastReadChapter === undefined ? {} : { lastReadChapter: toChapterRef(lastReadChapter) }),
      ...(readAt === '' ? {} : { lastReadAt: readAt }),
    });
  }

  return stats;
}

/**
 * Persists the live unread count. Only `unread_count` is written: the library's
 * `updated_at` is the resume-metadata event stamp and must not move on a recount.
 * A title with no local chapters keeps its stored count — a restored backup can
 * carry unread metadata before any provider chapter list is fetched.
 */
export async function recomputeLibraryUnreadCounts(
  db: AppDrizzleDb,
  entries: readonly LibraryEntry[],
): Promise<Map<LibraryEntryId, number>> {
  const stats = await getLibraryChapterStats(db, entries);
  const unread = new Map(
    entries.map((entry) => {
      const value = stats.get(entry.id);
      return [
        entry.id,
        value === undefined || value.chapterCount === 0 ? entry.unreadCount : value.unreadCount,
      ] as const;
    }),
  );
  const changed = entries.filter((entry) => entry.unreadCount !== unread.get(entry.id));

  if (changed.length > 0) {
    withTransaction(db, (tx) => {
      for (const entry of changed) {
        tx.update(libraryEntries)
          .set({ unreadCount: unread.get(entry.id) ?? entry.unreadCount })
          .where(eq(libraryEntries.id, entry.id))
          .run();
      }
    });
  }

  return unread;
}

/** Convenience for one title's detail view; returns the refreshed count. */
export async function getLibraryEntryUnreadCount(
  db: AppDrizzleDb,
  entry: LibraryEntry,
): Promise<number> {
  const unread = await recomputeLibraryUnreadCounts(db, [entry]);
  return unread.get(entry.id) ?? entry.unreadCount;
}
