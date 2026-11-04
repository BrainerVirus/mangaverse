import { createHash } from 'node:crypto';
import { existsSync, lstatSync, renameSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import type { CacheBlobKeyRewrite, SnapshotImportReport } from '../data-host-protocol.js';
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

const REMOVE_ATTEMPTS = 20;
const REMOVE_RETRY_MS = 25;
const RETRYABLE_REMOVE_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Unlinks `path`, resolving to the rejection instead of throwing it. */
const tryUnlink = (path: string): Promise<NodeJS.ErrnoException | null> =>
  unlink(path).then(
    () => null,
    (error: unknown) => error as NodeJS.ErrnoException,
  );

/**
 * Deletes one file, retrying on Windows where an open handle keeps it undeletable.
 * The entry is inspected with `lstat`, so a symlink (dangling or not) is a non-directory
 * that is unlinked itself, never followed. Deletion is `unlink` only, never recursive
 * (`rm` ignores `maxRetries` without `recursive`), so a directory at a predictable
 * scratch path, even one swapped in after the check, is never removed.
 */
async function removeOneFile(path: string): Promise<void> {
  const stats = lstatSync(path, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isDirectory()) {
    throw new Error(`Refusing to remove a directory at an import scratch path: ${path}`);
  }
  for (let attempt = 1; ; attempt += 1) {
    const failed = await tryUnlink(path);
    if (failed === null) return;
    const code = typeof failed.code === 'string' ? failed.code : '';
    if (code === 'ENOENT') return;
    if (attempt >= REMOVE_ATTEMPTS || !RETRYABLE_REMOVE_CODES.has(code)) throw failed;
    await pause(REMOVE_RETRY_MS);
  }
}

async function removeDatabaseFiles(path: string): Promise<void> {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    await removeOneFile(`${path}${suffix}`);
  }
}

/** SQLite refuses a file without this header; checking first avoids opening garbage. */
function hasSqliteHeader(bytes: Uint8Array): boolean {
  const header = new TextEncoder().encode('SQLite format 3\0');
  if (bytes.length < header.length) return false;
  return header.every((byte, index) => bytes[index] === byte);
}

/**
 * Rewrites cache blob pointers. Applied to both the scratch source and the imported copy, so
 * the content hashes are compared after the same change and the rewrite itself is verified.
 * A rewrite naming a row the snapshot does not have changes nothing; an orphaned blob is not
 * a reason to refuse the import.
 */
function applyPointerRewrites(
  database: DatabaseSync,
  rewrites: readonly CacheBlobKeyRewrite[],
): void {
  if (rewrites.length === 0) return;
  const statement = database.prepare('UPDATE main.cache_entries SET blob_key = ? WHERE id = ?');
  for (const rewrite of rewrites) statement.run(rewrite.blobKey, rewrite.id);
}

/** Where the import report is kept beside the native database. */
export const importMarkerPath = (databasePath: string): string => `${databasePath}.import.json`;

/**
 * Imports a sql.js snapshot (an SQLite file image) into a new native database at `targetPath`
 * (spec 04 X10). The bytes are copied to a scratch file and migrated there; the rows are then
 * copied table by table into a freshly migrated database, and every table's row count and
 * content hash must match the source before the result is renamed into place. Cache blob
 * pointers are rewritten on both sides before that comparison, so a file whose rows changed
 * only by a move is still verified. Any failure throws and leaves no file at `targetPath`.
 * The caller's snapshot is never written to.
 */
export async function importSnapshot(
  bytes: Uint8Array,
  targetPath: string,
  rewrites: readonly CacheBlobKeyRewrite[] = [],
): Promise<SnapshotImportReport> {
  if (existsSync(targetPath)) {
    throw new Error('A native database already exists; a snapshot is imported only once.');
  }
  if (!hasSqliteHeader(bytes)) {
    throw new Error('The snapshot is not a SQLite database.');
  }
  const sourcePath = `${targetPath}.import-source`;
  const workPath = `${targetPath}.import-work`;
  await removeDatabaseFiles(sourcePath);
  await removeDatabaseFiles(workPath);
  // `wx` fails on any existing path, a leftover link included, instead of writing through it.
  writeFileSync(sourcePath, bytes, { flag: 'wx' });
  try {
    const source = openNativeDatabase(sourcePath);
    let expected: Map<string, TableDigest>;
    try {
      const integrity = source.client.database.prepare('PRAGMA integrity_check').get();
      if (integrity?.integrity_check !== 'ok') {
        throw new Error('The snapshot failed its integrity check.');
      }
      applyPointerRewrites(source.client.database, rewrites);
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
      applyPointerRewrites(database, rewrites);
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
    // The database is in place, so the import has succeeded. The marker is a courtesy: a failed
    // write must not turn a finished import into `import_failed` beside a native database.
    await writeFile(
      importMarkerPath(targetPath),
      `${JSON.stringify({ version: 1, importedAt: new Date().toISOString(), ...report }, null, 2)}\n`,
    ).then(undefined, () => undefined);
    return report;
  } finally {
    // Best-effort: a scratch file that cannot be removed is harmless (the next import removes it
    // first) and must neither mask the original failure nor fail an import already renamed.
    await removeDatabaseFiles(sourcePath).then(undefined, () => undefined);
    await removeDatabaseFiles(workPath).then(undefined, () => undefined);
  }
}
