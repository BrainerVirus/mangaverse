import { createHash } from 'node:crypto';
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { SnapshotImportReport } from '../data-host-protocol.js';
import { openNativeDatabase } from './open-native.js';

interface TableDigest {
  readonly rows: number;
  readonly checksum: string;
}

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

function userTables(database: DatabaseSync, schema: string): string[] {
  return database
    .prepare(
      `SELECT name FROM ${schema}.sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name`,
    )
    .all()
    .map((row) => String(row.name));
}

function columns(database: DatabaseSync, schema: string, table: string): string[] {
  return database
    .prepare(`PRAGMA ${schema}.table_info(${quoteIdentifier(table)})`)
    .all()
    .map((row) => String(row.name));
}

/** Row count and a content hash of every row, in a fixed order. */
function digestTable(database: DatabaseSync, table: string): TableDigest {
  const names = columns(database, 'main', table).map(quoteIdentifier);
  const hash = createHash('sha256');
  let rows = 0;
  const statement = database.prepare(
    `SELECT ${names.join(', ')} FROM ${quoteIdentifier(table)} ORDER BY ${names.map((_, i) => i + 1).join(', ')}`,
  );
  statement.setReturnArrays(true);
  for (const row of statement.iterate()) {
    rows += 1;
    hash.update(
      JSON.stringify(row, (_key, value: unknown) =>
        value instanceof Uint8Array ? Buffer.from(value).toString('base64') : value,
      ),
    );
    hash.update('\n');
  }
  return { rows, checksum: hash.digest('hex') };
}

function digestDatabase(database: DatabaseSync): Map<string, TableDigest> {
  return new Map(
    userTables(database, 'main').map((table) => [table, digestTable(database, table)]),
  );
}

function sameDigests(
  expected: Map<string, TableDigest>,
  actual: Map<string, TableDigest>,
): string[] {
  const names = new Set([...expected.keys(), ...actual.keys()]);
  return [...names].filter((name) => {
    const want = expected.get(name);
    const got = actual.get(name);
    return want?.rows !== got?.rows || want?.checksum !== got?.checksum;
  });
}

function removeDatabaseFiles(path: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

/** Where the import report is kept beside the native database. */
export const importMarkerPath = (databasePath: string): string => `${databasePath}.import.json`;

/**
 * Imports a sql.js snapshot (an SQLite file image) into a new native database at `targetPath`
 * (spec 04 X10). The bytes are copied to a scratch file and migrated there; the rows are then
 * copied table by table into a freshly migrated database, and every table's row count and
 * content hash must match the source before the result is renamed into place. Any failure
 * throws and leaves no file at `targetPath`. The caller's snapshot is never written to.
 */
export function importSnapshot(bytes: Uint8Array, targetPath: string): SnapshotImportReport {
  if (existsSync(targetPath)) {
    throw new Error('A native database already exists; a snapshot is imported only once.');
  }
  const sourcePath = `${targetPath}.import-source`;
  const workPath = `${targetPath}.import-work`;
  removeDatabaseFiles(sourcePath);
  removeDatabaseFiles(workPath);
  writeFileSync(sourcePath, bytes);
  try {
    const source = openNativeDatabase(sourcePath);
    let expected: Map<string, TableDigest>;
    try {
      const integrity = source.client.database.prepare('PRAGMA integrity_check').get();
      if (integrity?.integrity_check !== 'ok') {
        throw new Error('The snapshot failed its integrity check.');
      }
      expected = digestDatabase(source.client.database);
    } finally {
      source.close();
    }

    const target = openNativeDatabase(workPath);
    let report: SnapshotImportReport;
    try {
      const database = target.client.database;
      // Rows arrive in table order, not dependency order; keys are checked once all are in.
      database.exec('PRAGMA foreign_keys = OFF');
      database.exec(`ATTACH DATABASE ${quoteLiteral(sourcePath)} AS snapshot`);
      database.exec('BEGIN IMMEDIATE');
      for (const table of userTables(database, 'snapshot')) {
        const names = columns(database, 'main', table).map(quoteIdentifier).join(', ');
        if (names.length === 0) continue;
        database.exec(
          `INSERT INTO main.${quoteIdentifier(table)} (${names}) SELECT ${names} FROM snapshot.${quoteIdentifier(table)}`,
        );
      }
      database.exec('COMMIT');
      database.exec('DETACH DATABASE snapshot');
      database.exec('PRAGMA foreign_keys = ON');
      if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
        throw new Error('The imported rows break a foreign key.');
      }
      const actual = digestDatabase(database);
      const mismatched = sameDigests(expected, actual);
      if (mismatched.length > 0) {
        throw new Error(`Imported rows differ from the snapshot in: ${mismatched.join(', ')}.`);
      }
      const tables = Object.fromEntries([...actual].map(([name, digest]) => [name, digest.rows]));
      report = {
        tables,
        totalRows: Object.values(tables).reduce((sum, rows) => sum + rows, 0),
        checksum: createHash('sha256')
          .update([...actual].map(([name, digest]) => `${name}:${digest.checksum}`).join('\n'))
          .digest('hex'),
      };
      database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      target.close();
    }
    renameSync(workPath, targetPath);
    writeFileSync(
      importMarkerPath(targetPath),
      `${JSON.stringify({ version: 1, importedAt: new Date().toISOString(), ...report }, null, 2)}\n`,
    );
    return report;
  } finally {
    removeDatabaseFiles(sourcePath);
    removeDatabaseFiles(workPath);
  }
}
