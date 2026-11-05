import { SYNCED_TABLES, type RowChange, type SyncedTable } from '../data-host-protocol.js';
import type { NodeSqliteClient } from './node-sqlite-client.js';

/**
 * Temp triggers record each row change on the synced tables into a temp table (ADR 0001,
 * decision 6). Both are temp: they live on the host's connection only and never reach the
 * file. A trigger's insert belongs to the statement's transaction, so a rollback takes the
 * record with it, and a foreign-key cascade fires the child table's trigger too.
 *
 * A library entry shows an unread count derived live from `chapters` and `chapter_read_state`,
 * not from its own row. So a change to either also records an `update` of the entry that owns
 * the chapter's title: a window refreshes that one entry whichever writer moved the chapter or
 * its read state, even one that leaves the entry's row untouched. A title outside the library
 * has no entry, so it records none.
 */
// Unqualified: a trigger body may not name a schema, and temp tables resolve first.
const CHANGES_TABLE = 'data_host_changes';

/** The entry changes a read-state row implies, for the chapters named in `chapterIds`. */
const readStateEntries = (chapterIds: string) =>
  `INSERT INTO ${CHANGES_TABLE} (tbl, row_key, op)
     SELECT 'library_entries', le.id, 'update'
     FROM chapters c JOIN library_entries le ON le.manga_id = c.manga_id
     WHERE c.id IN (${chapterIds});`;

/** The entry changes a chapter row implies, for the titles named in `mangaIds`. */
const chapterEntries = (mangaIds: string) =>
  `INSERT INTO ${CHANGES_TABLE} (tbl, row_key, op)
     SELECT 'library_entries', le.id, 'update'
     FROM library_entries le
     WHERE le.manga_id IN (${mangaIds});`;

function triggerSql(table: SyncedTable, key: string): string[] {
  const record = (row: 'NEW' | 'OLD', op: RowChange['op']) =>
    `INSERT INTO ${CHANGES_TABLE} (tbl, row_key, op) VALUES ('${table}', ${row}.${key}, '${op}');`;
  // `chapterIds` names chapter_read_state rows' chapters; `mangaIds` names chapters rows' titles.
  const derived = (chapterIds: string, mangaIds: string) => {
    if (table === 'chapter_read_state') return readStateEntries(chapterIds);
    if (table === 'chapters') return chapterEntries(mangaIds);
    return '';
  };
  return [
    `CREATE TEMP TRIGGER IF NOT EXISTS data_host_${table}_insert AFTER INSERT ON main.${table}
       BEGIN ${record('NEW', 'insert')} ${derived('NEW.chapter_id', 'NEW.manga_id')} END`,
    // A key that changes is the old row gone and the new one written.
    `CREATE TEMP TRIGGER IF NOT EXISTS data_host_${table}_update AFTER UPDATE ON main.${table}
       BEGIN
         INSERT INTO ${CHANGES_TABLE} (tbl, row_key, op)
           SELECT '${table}', OLD.${key}, 'delete' WHERE OLD.${key} IS NOT NEW.${key};
         ${record('NEW', 'update')}
         ${derived('OLD.chapter_id, NEW.chapter_id', 'OLD.manga_id, NEW.manga_id')}
       END`,
    `CREATE TEMP TRIGGER IF NOT EXISTS data_host_${table}_delete AFTER DELETE ON main.${table}
       BEGIN ${record('OLD', 'delete')} ${derived('OLD.chapter_id', 'OLD.manga_id')} END`,
  ];
}

export interface ChangeCapture {
  /** Takes the changes recorded since the last drain, one per row, and clears them. */
  drain(): RowChange[];
}

/** One change per row: a row inserted and then updated is still new to a window. */
function coalesce(rows: readonly RowChange[]): RowChange[] {
  const byRow = new Map<string, RowChange>();
  for (const change of rows) {
    const id = `${change.table}\u0000${change.key}`;
    const earlier = byRow.get(id);
    byRow.delete(id);
    byRow.set(
      id,
      earlier?.op === 'insert' && change.op === 'update' ? { ...change, op: 'insert' } : change,
    );
  }
  return [...byRow.values()];
}

export function installChangeCapture(client: NodeSqliteClient): ChangeCapture {
  client.exec(
    `CREATE TEMP TABLE IF NOT EXISTS ${CHANGES_TABLE} (
       seq INTEGER PRIMARY KEY, tbl TEXT NOT NULL, row_key TEXT NOT NULL, op TEXT NOT NULL)`,
  );
  for (const [table, key] of Object.entries(SYNCED_TABLES) as [SyncedTable, string][]) {
    for (const statement of triggerSql(table, key)) client.exec(statement);
  }
  const read = client.database.prepare(
    `SELECT tbl AS "table", row_key AS "key", op FROM ${CHANGES_TABLE} ORDER BY seq`,
  );
  const clear = client.database.prepare(`DELETE FROM ${CHANGES_TABLE}`);
  return {
    drain() {
      const rows = read.all() as unknown as RowChange[];
      if (rows.length === 0) return [];
      clear.run();
      return coalesce(rows);
    },
  };
}
