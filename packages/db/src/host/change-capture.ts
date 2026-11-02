import { SYNCED_TABLES, type RowChange, type SyncedTable } from '../data-host-protocol.js';
import type { NodeSqliteClient } from './node-sqlite-client.js';

/**
 * Temp triggers record each row change on the synced tables into a temp table (ADR 0001,
 * decision 6). Both are temp: they live on the host's connection only and never reach the
 * file. A trigger's insert belongs to the statement's transaction, so a rollback takes the
 * record with it, and a foreign-key cascade fires the child table's trigger too.
 */
// Unqualified: a trigger body may not name a schema, and temp tables resolve first.
const CHANGES_TABLE = 'data_host_changes';

function triggerSql(table: SyncedTable, key: string): string[] {
  const record = (row: 'NEW' | 'OLD', op: RowChange['op']) =>
    `INSERT INTO ${CHANGES_TABLE} (tbl, row_key, op) VALUES ('${table}', ${row}.${key}, '${op}');`;
  return [
    `CREATE TEMP TRIGGER IF NOT EXISTS data_host_${table}_insert AFTER INSERT ON main.${table}
       BEGIN ${record('NEW', 'insert')} END`,
    // A key that changes is the old row gone and the new one written.
    `CREATE TEMP TRIGGER IF NOT EXISTS data_host_${table}_update AFTER UPDATE ON main.${table}
       BEGIN
         INSERT INTO ${CHANGES_TABLE} (tbl, row_key, op)
           SELECT '${table}', OLD.${key}, 'delete' WHERE OLD.${key} IS NOT NEW.${key};
         ${record('NEW', 'update')}
       END`,
    `CREATE TEMP TRIGGER IF NOT EXISTS data_host_${table}_delete AFTER DELETE ON main.${table}
       BEGIN ${record('OLD', 'delete')} END`,
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
