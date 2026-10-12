import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { createDrizzleFromSqlJs } from './client.js';
import { createMemoryPersistedBytesStore } from './persisted-bytes-store.js';
import { openPersistentDatabase } from './persistent-database.js';
import { migrateDatabaseFromBundled, type BundledMigrationFile, type BundledMigrationJournal } from './bundled-migrations.js';
import { sql } from 'drizzle-orm';

const JOURNAL: BundledMigrationJournal = {
  version: '7',
  dialect: 'sqlite',
  entries: [{ idx: 0, version: '7', when: 1, tag: '0000_initial', breakpoints: true }],
};

const FILES: readonly BundledMigrationFile[] = [
  {
    tag: '0000_initial',
    hash: 'hash-0000',
    sql: 'CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL); --> statement-breakpoint',
  },
];

async function openOn(store: ReturnType<typeof createMemoryPersistedBytesStore>) {
  return openPersistentDatabase({
    store,
    sqlModule: await initSqlJs(),
    migrations: { journal: JOURNAL, files: FILES },
  });
}

describe('persistent database', () => {
  it('Given a saved note, When the database is reopened, Then the note is still stored', async () => {
    const store = createMemoryPersistedBytesStore();
    const first = await openOn(store);
    await first.db.run(sql`INSERT INTO notes (id, body) VALUES ('n1', 'first')`);
    await first.flush();
    first.close();

    const second = await openOn(store);
    const rows = await second.db.all<{ id: string; body: string }>(sql`SELECT id, body FROM notes`);
    expect(rows).toEqual([{ id: 'n1', body: 'first' }]);
    second.close();
  });

  it('Given unwritten changes, When the database is reopened without a flush, Then they are gone', async () => {
    const store = createMemoryPersistedBytesStore();
    const first = await openOn(store);
    await first.db.run(sql`INSERT INTO notes (id, body) VALUES ('n1', 'first')`);
    first.close();

    const second = await openOn(store);
    const rows = await second.db.all(sql`SELECT id FROM notes`);
    expect(rows).toEqual([]);
    second.close();
  });

  it('Given unreadable stored bytes, When the database opens, Then it quarantines them and starts fresh', async () => {
    const store = createMemoryPersistedBytesStore({
      bytes: new Uint8Array([1, 2, 3, 4]),
      version: 1,
    });
    const opened = await openOn(store);
    const rows = await opened.db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
    expect(rows.length).toBeGreaterThan(0);
    expect(opened.quarantinedBytes).toBe(true);
    opened.close();
  });

  it('Given another writer advanced the store, When this session flushes, Then it reloads instead of overwriting', async () => {
    const store = createMemoryPersistedBytesStore();
    const session = await openOn(store);
    await session.db.run(sql`INSERT INTO notes (id, body) VALUES ('local', 'mine')`);

    const SQL = await initSqlJs();
    const other = new SQL.Database();
    migrateDatabaseFromBundled(other, JOURNAL, FILES);
    other.run("INSERT INTO notes (id, body) VALUES ('remote', 'theirs')");
    const accepted = await store.write(other.export(), 0);
    expect(accepted).not.toBeNull();

    const result = await session.flush();
    expect(result.status).toBe('reloaded');

    // A reload replaces handles; re-read `session.db` before querying.
    await session.syncFromStore();
    const rows = await session.db.all<{ id: string }>(sql`SELECT id FROM notes ORDER BY id`);
    expect(rows.map((row) => row.id)).toEqual(['remote']);

    // The session now converges with the store instead of fighting it.
    const after = await session.flush();
    expect(after.status).toBe('saved');
    session.close();
  });
});
