import type { Database, SqlJsStatic } from 'sql.js';
import { hasLibraryResume, libraryResumeWins, progressOrderingWins } from './progress-ordering.js';

/**
 * Merge of uncommitted progress rows into a snapshot another writer committed.
 *
 * `flush` refuses to overwrite a store that advanced first (compare-and-swap).
 * Without a merge the local snapshot is discarded and an uncommitted progress
 * write from a newer tab is lost. Only the two progress tables are merged, and
 * only when the local row wins the ordering policy: every other table stays as
 * the committed snapshot has it, so a stale tab cannot resurrect anything it
 * never touched.
 */
export function mergeUncommittedProgress(
  incomingBytes: Uint8Array,
  local: Database,
  sqlModule: SqlJsStatic,
): Uint8Array | null {
  let incoming: Database | null = null;
  try {
    incoming = new sqlModule.Database(incomingBytes);
    incoming.run('PRAGMA foreign_keys = ON');
    let merged = false;

    for (const row of localChapterReadState(local)) {
      const existing = selectChapterReadState(incoming, row.chapterId);
      if (!progressWins(row, existing)) continue;
      incoming.run(
        `INSERT INTO chapter_read_state
           (chapter_id, manga_id, provider_mapping_id, read_percent, last_page_index, completed, started_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (chapter_id) DO UPDATE SET
           manga_id = excluded.manga_id,
           provider_mapping_id = excluded.provider_mapping_id,
           read_percent = excluded.read_percent,
           last_page_index = excluded.last_page_index,
           completed = excluded.completed,
           started_at = excluded.started_at,
           updated_at = excluded.updated_at`,
        [
          row.chapterId,
          row.mangaId,
          row.providerMappingId,
          row.readPercent,
          row.lastPageIndex,
          row.completed ? 1 : 0,
          row.startedAt,
          row.updatedAt,
        ],
      );
      merged = true;
    }

    for (const row of localLibraryResume(local)) {
      const existing = selectLibraryResume(incoming, row.mangaId);
      // A library entry without resume metadata has only a wall-clock
      // `updated_at`, so the local progress write always wins for it.
      if (
        existing !== null &&
        hasLibraryResume(existing) &&
        !libraryResumeWins(
          { timestamp: row.updatedAt ?? '', readPercent: row.progressPercent ?? -1 },
          { timestamp: existing.updatedAt, readPercent: existing.progressPercent },
        )
      ) {
        continue;
      }
      incoming.run(
        `UPDATE library_entries
            SET updated_at = ?, last_read_chapter_id = ?, progress_percent = ?
          WHERE manga_id = ?`,
        [row.updatedAt, row.lastReadChapterId, row.progressPercent, row.mangaId],
      );
      merged = true;
    }

    return merged ? incoming.export() : null;
  } catch {
    // Unreadable or unexpected bytes: fall back to the reload path.
    return null;
  } finally {
    incoming?.close();
  }
}

interface ChapterReadStateRow {
  readonly chapterId: string;
  readonly mangaId: string;
  readonly providerMappingId: string | null;
  readonly readPercent: number;
  readonly lastPageIndex: number;
  readonly completed: boolean;
  readonly startedAt: string | null;
  readonly updatedAt: string | null;
}

interface LibraryResumeRow {
  readonly mangaId: string;
  readonly lastReadChapterId: string | null;
  readonly progressPercent: number | null;
  readonly updatedAt: string | null;
}

function rowsOf(db: Database, sql: string): (string | number | null)[][] {
  const result = db.exec(sql);
  return (result[0]?.values ?? []).map((row) =>
    row.map((value) => (value instanceof Uint8Array ? null : value)),
  );
}

function localChapterReadState(db: Database): ChapterReadStateRow[] {
  return rowsOf(
    db,
    `SELECT chapter_id, manga_id, provider_mapping_id, read_percent, last_page_index, completed, started_at, updated_at
       FROM chapter_read_state`,
  ).map((row) => ({
    chapterId: String(row[0]),
    mangaId: String(row[1]),
    providerMappingId: row[2] === null ? null : String(row[2]),
    readPercent: Number(row[3]),
    lastPageIndex: Number(row[4]),
    completed: Number(row[5]) === 1,
    startedAt: row[6] === null ? null : String(row[6]),
    updatedAt: row[7] === null ? null : String(row[7]),
  }));
}

function selectChapterReadState(db: Database, chapterId: string): ChapterReadStateRow | null {
  const row = rowsOf(
    db,
    `SELECT chapter_id, manga_id, provider_mapping_id, read_percent, last_page_index, completed, started_at, updated_at
       FROM chapter_read_state WHERE chapter_id = '${chapterId.replace(/'/g, "''")}'`,
  )[0];
  if (row === undefined) return null;
  return {
    chapterId: String(row[0]),
    mangaId: String(row[1]),
    providerMappingId: row[2] === null ? null : String(row[2]),
    readPercent: Number(row[3]),
    lastPageIndex: Number(row[4]),
    completed: Number(row[5]) === 1,
    startedAt: row[6] === null ? null : String(row[6]),
    updatedAt: row[7] === null ? null : String(row[7]),
  };
}

function localLibraryResume(db: Database): LibraryResumeRow[] {
  return rowsOf(
    db,
    `SELECT manga_id, last_read_chapter_id, progress_percent, updated_at
       FROM library_entries
      WHERE last_read_chapter_id IS NOT NULL OR progress_percent IS NOT NULL`,
  ).map((row) => ({
    mangaId: String(row[0]),
    lastReadChapterId: row[1] === null ? null : String(row[1]),
    progressPercent: row[2] === null ? null : Number(row[2]),
    updatedAt: row[3] === null ? null : String(row[3]),
  }));
}

function selectLibraryResume(db: Database, mangaId: string): LibraryResumeRow | null {
  const row = rowsOf(
    db,
    `SELECT manga_id, last_read_chapter_id, progress_percent, updated_at
       FROM library_entries WHERE manga_id = '${mangaId.replace(/'/g, "''")}'`,
  )[0];
  if (row === undefined) return null;
  return {
    mangaId: String(row[0]),
    lastReadChapterId: row[1] === null ? null : String(row[1]),
    progressPercent: row[2] === null ? null : Number(row[2]),
    updatedAt: row[3] === null ? null : String(row[3]),
  };
}

function progressWins(
  incoming: ChapterReadStateRow,
  existing: ChapterReadStateRow | null,
): boolean {
  if (existing === null || existing.updatedAt === null || existing.updatedAt === '') return true;
  if (incoming.updatedAt === null || incoming.updatedAt === '') return false;
  return progressOrderingWins(
    {
      timestamp: incoming.updatedAt,
      pageIndex: incoming.lastPageIndex,
      readPercent: incoming.readPercent,
      completed: incoming.completed,
    },
    {
      timestamp: existing.updatedAt,
      pageIndex: existing.lastPageIndex,
      readPercent: existing.readPercent,
      completed: existing.completed,
    },
  );
}
