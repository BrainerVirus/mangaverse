import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toCategoryId, toChapterId } from '@app/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataHostClient, type DataHostClient } from '../data-host-client.js';
import {
  DATA_HOST_ERROR,
  DataHostError,
  type DataHostChangeEvent,
  type DataHostRequest,
  type RowChange,
} from '../data-host-protocol.js';
import {
  addLibraryEntry,
  createLibraryCategory,
  createMangaIdentityWithInitialMapping,
  deleteLibraryCategory,
  getChapterRows,
  listChapterWindow,
  reorderLibraryCategories,
  setLibraryEntriesFavorite,
  setLibraryEntryCategories,
  upsertAppSetting,
  upsertChapterMetadata,
} from '../routed.gen.js';
import { installChangeCapture } from './change-capture.js';
import { openNativeDatabase } from './open-native.js';
import { createDataHost, type DataHost } from './serve.js';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

interface Window {
  readonly client: DataHostClient;
  /** Everything the host posted to this window, in arrival order. */
  readonly messages: unknown[];
  readonly events: DataHostChangeEvent[];
}

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-changes-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function attachWindow(host: DataHost, options?: { callTimeoutMs?: number }): Window {
  const { port1, port2 } = new MessageChannel();
  const closed: (() => void)[] = [];
  host.attach({
    postMessage: (message) => port1.postMessage(message),
    onMessage: (listener) => {
      port1.onmessage = (event) => listener(event.data);
    },
    onClose: (listener) => closed.push(listener),
  });
  const messages: unknown[] = [];
  const client = createDataHostClient(
    {
      postMessage: (request) => port2.postMessage(request),
      onMessage: (listener) => {
        port2.onmessage = (event) => {
          messages.push(event.data);
          listener(event.data);
        };
      },
    },
    options,
  );
  const events: DataHostChangeEvent[] = [];
  client.onChange((event) => events.push(event));
  cleanups.push(() => {
    for (const listener of closed) listener();
    port1.close();
    port2.close();
  });
  return { client, messages, events };
}

async function openHost(directory = scratch()) {
  const databasePath = join(directory, 'library.sqlite');
  const host = createDataHost({ databasePath });
  cleanups.unshift(() => host.close());
  const first = attachWindow(host);
  const second = attachWindow(host);
  expect((await first.client.open(null)).ok).toBe(true);
  return { host, first, second, databasePath };
}

async function seedEntry(db: DataHostClient['handle'], title: string) {
  const identity = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: title,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: 'mangadex',
    providerMangaId: title,
  });
  if (!identity.ok) throw new Error(identity.error.message);
  const entry = await addLibraryEntry(db, { mangaId: identity.value.mangaId, status: 'reading' });
  if (!entry.ok) throw new Error(entry.error.message);
  return { ...identity.value, entryId: entry.value };
}

/** Waits until every batch the host has sent so far has been delivered. */
async function delivered(host: DataHost): Promise<void> {
  await host.idle();
  await new Promise((resolve) => setTimeout(resolve, 20));
}

const changesOf = (events: readonly DataHostChangeEvent[]): RowChange[] =>
  events.flatMap((event) => (event.kind === 'changes' ? event.changes : []));

describe('change capture', () => {
  it('records committed inserts, updates and deletes, and nothing a rollback undid', () => {
    const directory = scratch();
    const native = openNativeDatabase(join(directory, 'capture.sqlite'));
    cleanups.unshift(() => native.close());
    const capture = installChangeCapture(native.client);
    const exec = (sql: string) => native.client.exec(sql);

    exec(`INSERT INTO categories (id, name) VALUES ('c1', 'One')`);
    exec(`UPDATE categories SET name = 'Uno' WHERE id = 'c1'`);
    expect(capture.drain()).toEqual([{ table: 'categories', key: 'c1', op: 'insert' }]);

    exec('BEGIN');
    exec(`INSERT INTO categories (id, name) VALUES ('c2', 'Two')`);
    exec(`DELETE FROM categories WHERE id = 'c1'`);
    exec('ROLLBACK');
    expect(capture.drain()).toEqual([]);

    exec(`UPDATE categories SET id = 'c9' WHERE id = 'c1'`);
    expect(capture.drain()).toEqual([
      { table: 'categories', key: 'c1', op: 'delete' },
      { table: 'categories', key: 'c9', op: 'update' },
    ]);
    // Temp objects live on this connection only: the file has no trigger or change table.
    const persisted = native.client.database
      .prepare(`SELECT name FROM sqlite_master WHERE name LIKE 'data_host_%'`)
      .all();
    expect(persisted).toEqual([]);
  });
});

describe('change broadcast', () => {
  it('sends a committed write to every window, after the reply to the caller', async () => {
    const { first, second } = await openHost();
    const db = first.client.handle;
    const created = await createLibraryCategory(db, { name: 'Shelf' });
    if (!created.ok) throw new Error(created.error.message);

    await expect.poll(() => changesOf(second.events).length).toBeGreaterThan(0);
    for (const window of [first, second]) {
      expect(changesOf(window.events)).toEqual([
        { table: 'categories', key: created.value, op: 'insert' },
      ]);
    }
    // In the caller's stream, the reply comes first and the batch after it.
    const kinds = first.messages.map((message) =>
      (message as { kind?: string }).kind === 'changes' ? 'changes' : 'reply',
    );
    expect(kinds.slice(-2)).toEqual(['reply', 'changes']);
  });

  it('includes rows a foreign-key cascade removed', async () => {
    const { host, first, second } = await openHost();
    const db = first.client.handle;
    const { entryId } = await seedEntry(db, 'Cascade');
    const category = await createLibraryCategory(db, { name: 'Gone soon' });
    if (!category.ok) throw new Error(category.error.message);
    await setLibraryEntryCategories(db, entryId, [category.value]);
    await delivered(host);
    second.events.length = 0;

    await deleteLibraryCategory(db, category.value);
    await expect.poll(() => changesOf(second.events).length).toBe(2);
    expect(changesOf(second.events)).toEqual(
      expect.arrayContaining([
        { table: 'categories', key: category.value, op: 'delete' },
        { table: 'library_category_memberships', key: entryId, op: 'delete' },
      ]),
    );
  });

  it('broadcasts nothing for a transaction that rolled back, or for unsynced tables', async () => {
    const { first, second, databasePath } = await openHost();
    const db = first.client.handle;
    const ids = [];
    for (const name of ['A', 'B']) {
      const created = await createLibraryCategory(db, { name });
      if (!created.ok) throw new Error(created.error.message);
      ids.push(created.value);
    }
    await expect.poll(() => changesOf(second.events).length).toBe(2);
    second.events.length = 0;

    const side = openNativeDatabase(databasePath);
    side.client.exec(
      `CREATE TRIGGER fail_second BEFORE UPDATE ON categories WHEN NEW.id = '${ids[1]}'
       BEGIN SELECT RAISE(ABORT, 'forced failure'); END`,
    );
    side.close();
    await expect(reorderLibraryCategories(db, [ids[1]!, ids[0]!])).rejects.toBeInstanceOf(
      DataHostError,
    );
    await upsertAppSetting(db, 'unsynced', true);
    // A later synced write proves the stream is live, and that it is the only batch.
    const marker = await createLibraryCategory(db, { name: 'Marker' });
    if (!marker.ok) throw new Error(marker.error.message);
    await expect.poll(() => changesOf(second.events).length).toBe(1);
    expect(changesOf(second.events)).toEqual([
      { table: 'categories', key: marker.value, op: 'insert' },
    ]);
  });

  it('a library write reaches the other window as the rows it touched', async () => {
    const { host, first, second } = await openHost();
    const db = first.client.handle;
    const a = await seedEntry(db, 'Alpha');
    const b = await seedEntry(db, 'Beta');
    await delivered(host);
    second.events.length = 0;
    const result = await setLibraryEntriesFavorite(db, [a.entryId, b.entryId], true);
    expect(result.ok).toBe(true);
    await expect.poll(() => changesOf(second.events).length).toBe(2);
    expect(changesOf(second.events).map((change) => [change.table, change.key, change.op])).toEqual(
      [
        ['library_entries', a.entryId, 'update'],
        ['library_entries', b.entryId, 'update'],
      ],
    );
  });
});

describe('chapter windows', () => {
  async function seedChapters(db: DataHostClient['handle'], count: number) {
    const { mangaId, mappingId } = await seedEntry(db, 'Long series');
    for (let index = 0; index < count; index += 1) {
      const created = await upsertChapterMetadata(db, {
        mangaId,
        providerMappingId: mappingId,
        title: `Chapter ${index}`,
        index,
      });
      if (!created.ok) throw new Error(created.error.message);
    }
    return mangaId;
  }

  it('loads one bounded window in order, then the next after a cursor', async () => {
    const { first } = await openHost();
    const db = first.client.handle;
    const mangaId = await seedChapters(db, 30);
    const window = await listChapterWindow(db, { mangaId, limit: 10 });
    expect(window.map((row) => row.index)).toEqual(Array.from({ length: 10 }, (_, i) => i));
    const next = await listChapterWindow(db, { mangaId, limit: 10, afterIndex: 9 });
    expect(next.map((row) => row.index)).toEqual(Array.from({ length: 10 }, (_, i) => i + 10));
    const ties = await listChapterWindow(db, { mangaId, limit: 10, exactIndex: 4 });
    expect(ties.map((row) => row.title)).toEqual(['Chapter 4']);
    const rows = await getChapterRows(db, [window[0]!.id, toChapterId('missing')]);
    expect(rows.map((row) => row.title)).toEqual(['Chapter 0']);
  });

  it('refuses an unbounded load with a typed error', async () => {
    const { first } = await openHost();
    const db = first.client.handle;
    const { mangaId } = await seedEntry(db, 'Short');
    for (const request of [{ mangaId }, { mangaId, limit: 0 }, { mangaId, limit: 100_000 }]) {
      const error = await first.client.handle.call('listChapterWindow', [request]).then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(DataHostError);
      expect((error as DataHostError).code).toBe(DATA_HOST_ERROR.invalidInput);
    }
  });
});

describe('a host that stops answering', () => {
  it('times a pending call out with a typed error', async () => {
    const { port2 } = new MessageChannel();
    cleanups.push(() => port2.close());
    // A port whose other end nobody serves: the host died.
    const client = createDataHostClient(
      { postMessage: (request) => port2.postMessage(request), onMessage: () => undefined },
      { callTimeoutMs: 50 },
    );
    const started = Date.now();
    const error = await client.handle.call('listLibraryCategories', []).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(DataHostError);
    expect((error as DataHostError).code).toBe(DATA_HOST_ERROR.timeout);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it('ends a call pending across a reconnect at once as crashed, not as a timeout', async () => {
    const { port1, port2 } = new MessageChannel();
    cleanups.push(() => {
      port1.close();
      port2.close();
    });
    // Neither end is served, so only the reconnect can settle the call. The default 30 s call
    // timeout is left in place: waiting for it would fail the test's own timeout first.
    const client = createDataHostClient(
      { postMessage: (request) => port1.postMessage(request), onMessage: () => undefined },
      { openTimeoutMs: 50 },
    );
    const pendingCall = client.handle.call('listLibraryCategories', []).then(
      () => null,
      (reason: unknown) => reason,
    );
    const reopened = client.reconnect({
      postMessage: (request) => port2.postMessage(request),
      onMessage: () => undefined,
    });

    const error = await pendingCall;
    expect(error).toBeInstanceOf(DataHostError);
    expect((error as DataHostError).code).toBe(DATA_HOST_ERROR.crashed);
    expect((error as DataHostError).message).toMatch(/may or may not/);
    // The silent new port never opens; that is the open's own timeout, not a crash.
    expect(await reopened).toMatchObject({ ok: false, error: { code: DATA_HOST_ERROR.timeout } });
  });

  it('still times out a call to an attached but silent port after a reconnect', async () => {
    const { port1, port2 } = new MessageChannel();
    cleanups.push(() => {
      port1.close();
      port2.close();
    });
    const client = createDataHostClient(
      { postMessage: () => undefined, onMessage: () => undefined },
      { callTimeoutMs: 50, openTimeoutMs: 50 },
    );
    await client.reconnect({
      postMessage: (request) => port2.postMessage(request),
      onMessage: () => undefined,
    });
    const error = await client.handle.call('listLibraryCategories', []).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(DataHostError);
    expect((error as DataHostError).code).toBe(DATA_HOST_ERROR.timeout);
  });

  it('reconnects to a restarted host, reopens it first, and asks windows to resync', async () => {
    const directory = scratch();
    const { first } = await openHost(directory);
    const db = first.client.handle;
    const created = await createLibraryCategory(db, { name: 'Survives' });
    if (!created.ok) throw new Error(created.error.message);

    // A second host on the same file stands in for the restarted process.
    const restarted = createDataHost({ databasePath: join(directory, 'library.sqlite') });
    cleanups.unshift(() => restarted.close());
    const { port1, port2 } = new MessageChannel();
    restarted.attach({
      postMessage: (message) => port1.postMessage(message),
      onMessage: (listener) => {
        port1.onmessage = (event) => listener(event.data);
      },
    });
    cleanups.push(() => {
      port1.close();
      port2.close();
    });
    const sent: DataHostRequest[] = [];
    const reopened = first.client.reconnect({
      postMessage: (request) => {
        sent.push(request);
        port2.postMessage(request);
      },
      onMessage: (listener) => {
        port2.onmessage = (event) => listener(event.data);
      },
    });
    // A call made right away still reaches an open database: open went first.
    const reorder = reorderLibraryCategories(db, [toCategoryId(created.value)]);
    expect(sent[0]?.kind).toBe('open');
    expect((await reopened).ok).toBe(true);
    expect((await reorder).ok).toBe(true);
    expect(first.events.at(-1)).toEqual({ kind: 'resync' });
    expect(restarted.ports()).toBe(1);
  });
});
