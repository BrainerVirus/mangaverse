import { eq, inArray, sql } from 'drizzle-orm';
import type { LibraryEntry, LibraryEntryId } from '@app/shared';
import type { AppDrizzleDb } from './adapter.js';
import { readIdChunks } from './read-id-chunks.js';
import { chapterReadState, chapters, mangaIdentities } from './schema.js';

/**
 * Unread counts for one page of library rows. An internal query, not a host procedure:
 * the page asks the host for its rows and this runs beside it.
 */
export interface LibraryChapterCounts {
  /** Chapters on the entry's reading mapping, or every mapping when it has none. */
  readonly chapterCount: number;
  readonly unreadCount: number;
}

/**
 * Unread counts for one page of library rows, grouped per title and mapping in SQL so a
 * page never reads a title's chapters into the process. Same rules as
 * `getLibraryChapterStats`: the active (then default) mapping wins, and a title with no
 * chapters on it falls back to every mapping.
 */
export async function getLibraryUnreadCounts(
  db: AppDrizzleDb,
  entries: readonly LibraryEntry[],
): Promise<Map<LibraryEntryId, LibraryChapterCounts>> {
  const counts = new Map<LibraryEntryId, LibraryChapterCounts>();
  if (entries.length === 0) return counts;

  const mangaIds = entries.map((entry) => entry.mangaId);
  const groups = readIdChunks(mangaIds, (chunk) =>
    db
      .select({
        mangaId: chapters.mangaId,
        providerMappingId: chapters.providerMappingId,
        chapterCount: sql<number>`count(*)`,
        unreadCount: sql<number>`sum(
          case when ${chapterReadState.completed} is null
            or ${chapterReadState.completed} = 0 then 1 else 0 end
        )`,
      })
      .from(chapters)
      .leftJoin(chapterReadState, eq(chapterReadState.chapterId, chapters.id))
      .where(inArray(chapters.mangaId, chunk))
      .groupBy(chapters.mangaId, chapters.providerMappingId)
      .all(),
  );

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

  const groupsByMangaId = new Map<string, (typeof groups)[number][]>();
  for (const group of groups) {
    const list = groupsByMangaId.get(group.mangaId);
    if (list === undefined) groupsByMangaId.set(group.mangaId, [group]);
    else list.push(group);
  }

  for (const entry of entries) {
    const all = groupsByMangaId.get(entry.mangaId) ?? [];
    const sourceMappingId =
      entry.activeProviderMappingId ?? defaultMappingByMangaId.get(entry.mangaId);
    const scoped = all.filter((group) => group.providerMappingId === sourceMappingId);
    const rows = scoped.length > 0 ? scoped : all;
    counts.set(entry.id, {
      chapterCount: rows.reduce((sum, row) => sum + row.chapterCount, 0),
      unreadCount: rows.reduce((sum, row) => sum + row.unreadCount, 0),
    });
  }
  return counts;
}
