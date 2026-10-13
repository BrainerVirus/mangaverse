import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
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
    first.db.run(sql`INSERT INTO notes (id, body) VALUES ('n1', 'first')`);
    await first.flush();
    first.close();

    const second = await openOn(store);
    const rows = second.db.all<{ id: string; body: string }>(sql`SELECT id, body FROM notes`);
    expect(rows).toEqual([{ id: 'n1', body: 'first' }]);
    second.close();
  });

  it('Given unwritten changes, When the database is reopened without a flush, Then they are gone', async () => {
    const store = createMemoryPersistedBytesStore();
    const first = await openOn(store);
    first.db.run(sql`INSERT INTO notes (id, body) VALUES ('n1', 'first')`);
    first.close();

    const second = await openOn(store);
    const rows = second.db.all(sql`SELECT id FROM notes`);
    expect(rows).toEqual([]);
    second.close();
  });

  it('Given unreadable stored bytes, When the database opens, Then it quarantines them and starts fresh', async () => {
    const store = createMemoryPersistedBytesStore({
      bytes: new Uint8Array([1, 2, 3, 4]),
      version: 1,
    });
    const opened = await openOn(store);
    const rows = opened.db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
    expect(rows.length).toBeGreaterThan(0);
    expect(opened.quarantinedBytes).toBe(true);
    opened.close();
  });

  it('Given a synced session, When handles age out, Then the previous handle survives one sync and closes on the next', async () => {
    const store = createMemoryPersistedBytesStore();
    const session = await openOn(store);
    const firstHandle = session.db;

    // Another writer advances the store twice, forcing two sync generations.
    const SQL = await initSqlJs();
    const other = new SQL.Database();
    migrateDatabaseFromBundled(other, JOURNAL, FILES);

    other.run("INSERT INTO notes (id, body) VALUES ('gen1', 'a')");
    await store.write(other.export(), 0);
    await session.flush(); // reloaded (conflict)
    const sync1 = await session.syncFromStore();
    expect(sync1).toBeUndefined();
    // One-generation buffer: the retired handle still answers queries.
    let retiredHandleThrew = false;
    try {
      firstHandle.all(sql`SELECT 1`);
    } catch {
      retiredHandleThrew = true;
    }
    expect(retiredHandleThrew).toBe(false);

    other.run("INSERT INTO notes (id, body) VALUES ('gen2', 'b')");
    await store.write(other.export(), 1);
    await session.flush(); // reloaded again
    await session.syncFromStore();
    // The oldest generation is closed now (sync or async throw both count).
    let closedHandleThrew = false;
    try {
      firstHandle.all(sql`SELECT 1`);
    } catch {
      closedHandleThrew = true;
    }
    expect(closedHandleThrew).toBe(true);

    session.close();
  });

  it('Given a committed snapshot at the loaded version, When sync runs, Then the working handle is not retired', async () => {
    const store = createMemoryPersistedBytesStore();
    const SQL = await initSqlJs();
    const seed = new SQL.Database();
    migrateDatabaseFromBundled(seed, JOURNAL, FILES);
    seed.run("INSERT INTO notes (id, body) VALUES ('seed', 's')");
    await store.write(seed.export(), 0); // version 1, equal to the session's base

    const session = await openPersistentDatabase({
      store,
      sqlModule: SQL,
      migrations: { journal: JOURNAL, files: FILES },
    });
    const before = session.db;
    await session.syncFromStore();
    // Without the version no-op check this swap would replace the handle.
    expect(session.db).toBe(before);
    session.close();
  });

  it('Given a closed session, When a sync is in flight, Then it does not revive the database', async () => {
    const inner = createMemoryPersistedBytesStore();
    const SQL = await initSqlJs();
    const seed = new SQL.Database();
    migrateDatabaseFromBundled(seed, JOURNAL, FILES);
    seed.run("INSERT INTO notes (id, body) VALUES ('seed', 's')");
    await inner.write(seed.export(), 0);

    let gate: Promise<void> | null = null;
    let release: () => void = () => {};
    const gatedStore = {
      read: async () => {
        if (gate !== null) await gate;
        return inner.read();
      },
      write: inner.write,
      clear: inner.clear,
    };

    const session = await openPersistentDatabase({
      store: gatedStore,
      sqlModule: SQL,
      migrations: { journal: JOURNAL, files: FILES },
    });
    const before = session.db;

    // A newer committed snapshot waits behind the gate, so without the closed
    // guard the parked sync would swap it into the closed session.
    const newer = new SQL.Database();
    migrateDatabaseFromBundled(newer, JOURNAL, FILES);
    newer.run("INSERT INTO notes (id, body) VALUES ('newer', 'n')");
    await inner.write(newer.export(), 1);

    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const syncing = session.syncFromStore();
    session.close();
    release();
    gate = null;
    await syncing;

    // A sync that was parked in `read` must not swap a live handle back in.
    expect(session.db).toBe(before);
  });

  it('Given a flush, When a later write happens, Then the mutation hook still fires', async () => {
    const store = createMemoryPersistedBytesStore();
    const SQL = await initSqlJs();
    let mutations = 0;
    const session = await openPersistentDatabase({
      store,
      sqlModule: SQL,
      migrations: { journal: JOURNAL, files: FILES },
      onMutation: () => {
        mutations += 1;
      },
    });

    session.db.run(sql`INSERT INTO notes (id, body) VALUES ('a', '1')`);
    await session.flush();
    // sql.js export() detaches the update hook; the session must re-attach it.
    session.db.run(sql`INSERT INTO notes (id, body) VALUES ('b', '2')`);
    expect(mutations).toBe(2);
    session.close();
  });

  it('Given a flush, When it completes, Then foreign keys stay enforced', async () => {
    const store = createMemoryPersistedBytesStore();
    const SQL = await initSqlJs();
    const session = await openPersistentDatabase({
      store,
      sqlModule: SQL,
      migrations: { journal: JOURNAL, files: FILES },
    });

    await session.flush();
    const pragma = session.raw.exec('PRAGMA foreign_keys');
    expect(pragma[0]?.values[0]?.[0]).toBe(1);
    session.close();
  });

  it('Given a stored snapshot, When it opens, Then foreign keys are enforced', async () => {
    const store = createMemoryPersistedBytesStore();
    const SQL = await initSqlJs();
    const seed = new SQL.Database();
    migrateDatabaseFromBundled(seed, JOURNAL, FILES);
    await store.write(seed.export(), 0);

    const session = await openPersistentDatabase({
      store,
      sqlModule: SQL,
      migrations: { journal: JOURNAL, files: FILES },
    });
    const pragma = session.raw.exec('PRAGMA foreign_keys');
    expect(pragma[0]?.values[0]?.[0]).toBe(1);
    session.close();
  });

  it('Given a sync swap, When writes follow, Then FK enforcement and the hook survive', async () => {
    const store = createMemoryPersistedBytesStore();
    const SQL = await initSqlJs();
    let mutations = 0;
    const session = await openPersistentDatabase({
      store,
      sqlModule: SQL,
      migrations: { journal: JOURNAL, files: FILES },
      onMutation: () => {
        mutations += 1;
      },
    });

    // Force a swap: another writer advances the store, this session syncs.
    const other = new SQL.Database();
    migrateDatabaseFromBundled(other, JOURNAL, FILES);
    other.run("INSERT INTO notes (id, body) VALUES ('peer', 'p')");
    await store.write(other.export(), 0);
    await session.syncFromStore();

    const pragma = session.raw.exec('PRAGMA foreign_keys');
    expect(pragma[0]?.values[0]?.[0]).toBe(1);
    const before = mutations;
    session.db.run(sql`INSERT INTO notes (id, body) VALUES ('after-swap', 'a')`);
    expect(mutations).toBe(before + 1);
    session.close();
  });

  it('Given another writer advanced the store, When this session flushes, Then it reloads instead of overwriting', async () => {
    const store = createMemoryPersistedBytesStore();
    const session = await openOn(store);
    session.db.run(sql`INSERT INTO notes (id, body) VALUES ('local', 'mine')`);

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
    const rows = session.db.all<{ id: string }>(sql`SELECT id FROM notes ORDER BY id`);
    expect(rows.map((row) => row.id)).toEqual(['remote']);

    // The session now converges with the store instead of fighting it.
    const after = await session.flush();
    expect(after.status).toBe('saved');
    session.close();
  });
});
