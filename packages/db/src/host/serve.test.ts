import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataHostClient, type DataHostClient } from '../data-host-client.js';
import { DATA_HOST_ERROR, DataHostError, type DataHostReply } from '../data-host-protocol.js';
import {
  createLibraryCategory,
  getAppSetting,
  listLibraryCategories,
  listLibraryEntries,
  reorderLibraryCategories,
  upsertAppSetting,
} from '../routed.gen.js';
import { NATIVE_PRAGMAS, openNativeDatabase } from './open-native.js';
import { createDataHost, type DataHost } from './serve.js';

interface Connected {
  readonly host: DataHost;
  readonly client: DataHostClient;
  readonly databasePath: string;
  /** Posts anything on the window's end, bypassing the client. */
  readonly post: (message: unknown) => void;
  readonly replies: DataHostReply[];
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function connect(directory = mkdtempSync(join(tmpdir(), 'mangaverse-host-'))): Connected {
  const databasePath = join(directory, 'library.sqlite');
  const host = createDataHost({ databasePath });
  const { port1, port2 } = new MessageChannel();
  host.attach({
    postMessage: (reply) => port1.postMessage(reply),
    onMessage: (listener) => {
      port1.onmessage = (event) => listener(event.data);
    },
  });
  const replies: DataHostReply[] = [];
  const client = createDataHostClient({
    postMessage: (request) => port2.postMessage(request),
    onMessage: (listener) => {
      port2.onmessage = (event) => {
        replies.push(event.data as DataHostReply);
        listener(event.data);
      };
    },
  });
  cleanups.push(() => {
    host.close();
    port1.close();
    port2.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { host, client, databasePath, post: (message) => port2.postMessage(message), replies };
}

async function opened(): Promise<Connected> {
  const connected = connect();
  const result = await connected.client.open(null);
  expect(result.ok).toBe(true);
  return connected;
}

async function rejection(promise: Promise<unknown>): Promise<DataHostError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DataHostError);
  return error as DataHostError;
}

describe('data host', () => {
  it('opens node:sqlite with WAL, foreign keys and synchronous=NORMAL, fully migrated', async () => {
    const { databasePath, client } = await opened();
    const status = await client.status();
    expect(status).toEqual({ ok: true, value: { open: true, nativeExists: true } });

    const side = openNativeDatabase(databasePath);
    const pragma = (name: string) =>
      Object.values(side.client.database.prepare(`PRAGMA ${name}`).get() ?? {})[0];
    expect(pragma('journal_mode')).toBe(NATIVE_PRAGMAS.journal_mode);
    expect(pragma('foreign_keys')).toBe(NATIVE_PRAGMAS.foreign_keys);
    expect(pragma('synchronous')).toBe(NATIVE_PRAGMAS.synchronous);
    const migrations = side.client.database
      .prepare('SELECT count(*) AS n FROM __drizzle_migrations')
      .get();
    expect(migrations?.n).toBe(9);
    side.close();
  });

  it('runs a routed repository in the host with the same name and call shape', async () => {
    const { client } = await opened();
    const db = client.handle;
    const created = await createLibraryCategory(db, { name: 'Reading list' });
    expect(created.ok).toBe(true);
    const categories = await listLibraryCategories(db);
    expect(categories.map((category) => category.name)).toEqual(['Reading list']);
    expect(await listLibraryEntries(db)).toEqual([]);
  });

  it('refuses a call before the database is open', async () => {
    const { client } = connect();
    const error = await rejection(listLibraryCategories(client.handle));
    expect(error.code).toBe(DATA_HOST_ERROR.notOpen);
  });

  it('validates arguments with Zod before a procedure runs', async () => {
    const { client } = await opened();
    const db = client.handle;
    const badSort = await rejection(
      client.handle.call('listLibraryEntries', [{ sort: { key: 'nope', direction: 'asc' } }]),
    );
    expect(badSort.code).toBe(DATA_HOST_ERROR.invalidInput);
    const wrongArity = await rejection(client.handle.call('listLibraryCategories', ['extra']));
    expect(wrongArity.code).toBe(DATA_HOST_ERROR.invalidInput);
    const wrongType = await rejection(client.handle.call('upsertAppSetting', [42, 'value']));
    expect(wrongType.code).toBe(DATA_HOST_ERROR.invalidInput);
    // Nothing ran: the store is still empty.
    expect(await listLibraryCategories(db)).toEqual([]);
  });

  it('refuses an unknown procedure and keeps withTransaction in the host', async () => {
    const { client } = await opened();
    for (const method of ['dropEverything', 'withTransaction']) {
      const error = await rejection(client.handle.call(method, []));
      expect(error.code).toBe(DATA_HOST_ERROR.unknownProcedure);
    }
  });

  it('answers a malformed message with a typed error and keeps serving', async () => {
    const { client, post, replies, host } = await opened();
    post({ kind: 'call', id: 41, method: 'listLibraryCategories' });
    post({ kind: 'drop', id: 42 });
    post('not a request');
    post({ kind: 'open', id: 43, snapshot: 'bytes' });
    await host.idle();
    await expect.poll(() => replies.length).toBeGreaterThanOrEqual(5);
    const refused = replies.filter((reply) => !reply.result.ok);
    expect(refused.map((reply) => reply.id)).toEqual([41, 42, null, 43]);
    for (const reply of refused) {
      expect(reply.result).toMatchObject({
        ok: false,
        error: { code: DATA_HOST_ERROR.malformedMessage },
      });
    }
    expect(await listLibraryCategories(client.handle)).toEqual([]);
  });

  it('answers calls strictly in arrival order, each after the writes sent before it', async () => {
    const { client } = await opened();
    const db = client.handle;
    const calls: Promise<unknown>[] = [];
    for (let index = 0; index < 20; index += 1) {
      calls.push(upsertAppSetting(db, 'counter', index));
      calls.push(getAppSetting(db, 'counter'));
    }
    const results = await Promise.all(calls);
    const reads = results.filter((_, index) => index % 2 === 1);
    expect(reads).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  it('serves two windows from one queue', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mangaverse-host-'));
    const first = connect(directory);
    await first.client.open(null);
    const { port1, port2 } = new MessageChannel();
    first.host.attach({
      postMessage: (reply) => port1.postMessage(reply),
      onMessage: (listener) => {
        port1.onmessage = (event) => listener(event.data);
      },
    });
    const second = createDataHostClient({
      postMessage: (request) => port2.postMessage(request),
      onMessage: (listener) => {
        port2.onmessage = (event) => listener(event.data);
      },
    });
    cleanups.push(() => {
      port1.close();
      port2.close();
    });
    await createLibraryCategory(first.client.handle, { name: 'From window one' });
    const seen = await listLibraryCategories(second.handle);
    expect(seen.map((category) => category.name)).toEqual(['From window one']);
  });

  it('rolls a transaction back when it fails part-way, and reports a typed error', async () => {
    const { client, databasePath } = await opened();
    const db = client.handle;
    const ids: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      const created = await createLibraryCategory(db, { name });
      if (!created.ok) throw new Error(created.error.message);
      ids.push(created.value);
    }
    const before = await listLibraryCategories(db);

    // The second update of the reorder transaction fails after the first one has run.
    const side = openNativeDatabase(databasePath);
    side.client.exec(
      `CREATE TRIGGER fail_second BEFORE UPDATE ON categories WHEN NEW.id = '${ids[1]}'
       BEGIN SELECT RAISE(ABORT, 'forced failure'); END`,
    );
    const error = await rejection(
      reorderLibraryCategories(db, [ids[2]!, ids[1]!, ids[0]!] as never),
    );
    expect(error.code).toBe(DATA_HOST_ERROR.procedureFailed);
    expect(error.message).toMatch(/forced failure/);
    expect(await listLibraryCategories(db)).toEqual(before);

    side.client.exec('DROP TRIGGER fail_second');
    side.close();
    const committed = await reorderLibraryCategories(db, [ids[2]!, ids[1]!, ids[0]!] as never);
    expect(committed.ok).toBe(true);
    expect((await listLibraryCategories(db)).map((category) => category.name)).toEqual([
      'C',
      'B',
      'A',
    ]);
  });
});
