import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import initSqlJs from 'sql.js';
import { afterEach, describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import { migrateDatabaseFromBundled } from '../bundled-migrations.js';
import { createDrizzleFromSqlJs } from '../client.js';
import { createDataHostClient } from '../data-host-client.js';
import { DATA_HOST_ERROR } from '../data-host-protocol.js';
import { getMigrationsFolder } from '../migrations-folder.js';
import * as local from '../procedure-sources.js';
import {
  addLibraryEntry,
  createLibraryCategory,
  createMangaIdentityWithInitialMapping,
  getAppSetting,
  listLibraryCategories,
  listLibraryEntries,
  upsertAppSetting,
} from '../routed.gen.js';
import { importMarkerPath } from './import-snapshot.js';
import { createDataHost } from './serve.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A snapshot made the way the web renderer makes one: sql.js and the bundled migrator. */
async function rendererSnapshot(): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  const folder = getMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
  const hashes = readMigrationFiles({ migrationsFolder: folder }).map((m) => m.hash);
  migrateDatabaseFromBundled(
    raw,
    journal,
    journal.entries.map((entry: { tag: string }, index: number) => ({
      tag: entry.tag,
      sql: readFileSync(join(folder, `${entry.tag}.sql`), 'utf8'),
      hash: hashes[index]!,
    })),
  );
  const db = createDrizzleFromSqlJs(raw);
  for (const title of ['Alpha', 'Beta', 'Gamma']) {
    const identity = await local.createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: title,
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('mangadex'),
      providerMangaId: title.toLowerCase(),
    });
    if (!identity.ok) throw new Error(identity.error.message);
    await local.addLibraryEntry(db, { mangaId: identity.value.mangaId, status: 'reading' });
  }
  await local.createLibraryCategory(db, { name: 'Favourites' });
  await local.upsertAppSetting(db, 'onboarding', { completed: true });
  const bytes = raw.export();
  raw.close();
  return bytes;
}

function host(directory: string) {
  const dataHost = createDataHost({ databasePath: join(directory, 'library.sqlite') });
  const { port1, port2 } = new MessageChannel();
  dataHost.attach({
    postMessage: (reply) => port1.postMessage(reply),
    onMessage: (listener) => {
      port1.onmessage = (event) => listener(event.data);
    },
  });
  const client = createDataHostClient({
    postMessage: (request) => port2.postMessage(request),
    onMessage: (listener) => {
      port2.onmessage = (event) => listener(event.data);
    },
  });
  cleanups.push(() => {
    dataHost.close();
    port1.close();
    port2.close();
  });
  return { client, close: () => dataHost.close() };
}

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-import-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

describe('snapshot import', () => {
  it('imports a renderer snapshot once, verifies counts and content, and serves the library', async () => {
    const snapshot = await rendererSnapshot();
    const original = Uint8Array.from(snapshot);
    const directory = scratch();
    const { client, close } = host(directory);

    expect(await client.status()).toEqual({
      ok: true,
      value: { open: false, nativeExists: false },
    });
    const result = await client.open(snapshot);
    if (!result.ok) throw new Error(result.error.message);
    const report = result.value.imported;
    expect(report?.tables).toMatchObject({
      manga_identities: 3,
      library_entries: 3,
      categories: 1,
      app_settings: 1,
    });
    expect(report?.totalRows).toBeGreaterThanOrEqual(8);
    expect(report?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot).toEqual(original);

    const entries = await listLibraryEntries(client.handle);
    expect(entries).toHaveLength(3);
    expect((await listLibraryCategories(client.handle)).map((c) => c.name)).toEqual(['Favourites']);
    expect(await getAppSetting(client.handle, 'onboarding')).toEqual({ completed: true });
    const marker = JSON.parse(
      readFileSync(importMarkerPath(join(directory, 'library.sqlite')), 'utf8'),
    );
    expect(marker).toMatchObject({ version: 1, totalRows: report?.totalRows });
    expect(readdirSync(directory).filter((name) => name.includes('.import-'))).toEqual([]);

    // A later start offers another snapshot: the native database wins and nothing is imported.
    await createLibraryCategory(client.handle, { name: 'Written natively' });
    close();
    const again = host(directory);
    expect(await again.client.status()).toEqual({
      ok: true,
      value: { open: false, nativeExists: true },
    });
    const reopened = await again.client.open(await rendererSnapshot());
    expect(reopened).toEqual({ ok: true, value: { imported: null } });
    expect((await listLibraryCategories(again.client.handle)).map((c) => c.name)).toEqual([
      'Favourites',
      'Written natively',
    ]);
  });

  it('refuses an unreadable snapshot with a typed error and leaves no native database', async () => {
    const directory = scratch();
    const { client } = host(directory);
    const garbage = new TextEncoder().encode('this is not an SQLite file');
    const failed = await client.open(garbage);
    expect(failed).toMatchObject({ ok: false, error: { code: DATA_HOST_ERROR.importFailed } });
    expect(new TextDecoder().decode(garbage)).toBe('this is not an SQLite file');
    expect(existsSync(join(directory, 'library.sqlite'))).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
    expect(await client.status()).toEqual({
      ok: true,
      value: { open: false, nativeExists: false },
    });

    // The calls stay refused until an open succeeds, so nothing writes to a half-made file.
    const refused = await listLibraryEntries(client.handle).then(
      () => null,
      (error: { code?: string }) => error.code,
    );
    expect(refused).toBe(DATA_HOST_ERROR.notOpen);

    // A later attempt with a good snapshot still imports.
    const retried = await client.open(await rendererSnapshot());
    expect(retried.ok && retried.value.imported?.tables.library_entries).toBe(3);
  });

  it('opens a fresh database when there is no snapshot to import', async () => {
    const { client } = host(scratch());
    expect(await client.open(null)).toEqual({ ok: true, value: { imported: null } });
    const identity = await createMangaIdentityWithInitialMapping(client.handle, {
      canonicalTitle: 'Fresh',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('mangadex'),
      providerMangaId: 'fresh',
    });
    if (!identity.ok) throw new Error(identity.error.message);
    await addLibraryEntry(client.handle, { mangaId: identity.value.mangaId, status: 'reading' });
    await upsertAppSetting(client.handle, 'onboarding', { completed: true });
    expect(await getAppSetting(client.handle, 'onboarding')).toEqual({ completed: true });
    expect(await listLibraryEntries(client.handle)).toHaveLength(1);
  });
});
