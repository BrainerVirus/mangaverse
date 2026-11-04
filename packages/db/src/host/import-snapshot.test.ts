import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import type * as NodeFs from 'node:fs';
import type * as NodeFsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import initSqlJs from 'sql.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  getCacheEntryById,
  listLibraryCategories,
  listLibraryEntries,
  rewriteCacheBlobKeys,
  upsertAppSetting,
  upsertCacheEntry,
} from '../routed.gen.js';
import { importMarkerPath } from './import-snapshot.js';
import { createDataHost } from './serve.js';

// One-shot faults for the files the import touches after its rename (#311).
const faults = vi.hoisted(() => ({ marker: false, scratch: false }));
const fault = (code: string) => Object.assign(new Error(code), { code });
// The marker is faulted through both the sync and the promise API, so the test holds for
// whichever the import uses.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (faults.marker && String(args[0]).endsWith('.import.json')) {
        faults.marker = false;
        throw fault('ENOSPC');
      }
      return actual.writeFileSync(...args);
    },
  };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    writeFile: (...args: Parameters<typeof actual.writeFile>) => {
      if (faults.marker && String(args[0]).endsWith('.import.json')) {
        faults.marker = false;
        return Promise.reject(fault('ENOSPC'));
      }
      return actual.writeFile(...args);
    },
    unlink: (...args: Parameters<typeof actual.unlink>) => {
      if (faults.scratch && String(args[0]).endsWith('.import-source')) {
        faults.scratch = false;
        return Promise.reject(fault('EIO'));
      }
      return actual.unlink(...args);
    },
  };
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  faults.marker = false;
  faults.scratch = false;
  // Reverse order: a scratch directory is created before the host that opens a file inside
  // it, so the handle must close before the directory is removed (Windows refuses otherwise).
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** A snapshot made the way the web renderer makes one: sql.js and the bundled migrator. */
async function rendererSnapshot(
  adjust?: (db: ReturnType<typeof createDrizzleFromSqlJs>) => Promise<void>,
): Promise<Uint8Array> {
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
  await adjust?.(db);
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
    close: () => port2.close(),
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
  cleanups.push(() =>
    rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 25 }),
  );
  return directory;
}

describe('snapshot import', () => {
  // Each rendererSnapshot() builds a sql.js database with the bundled migrations; a loaded CI runner
  // pushed that past Vitest's 5 s default on 2026-11-04 (run 41886692481), though it takes ~0.4 s locally.
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
  }, 30_000);

  it('rewrites cache blob pointers inside the same verified import', async () => {
    const snapshot = await rendererSnapshot(async (db) => {
      await local.upsertCacheEntry(db, {
        id: 'cover:mangadex:manga-1',
        providerId: 'mangadex',
        mangaId: 'manga-1',
        cacheKind: 'cover',
        sourceUrl: 'https://example.com/custom.jpg',
        mimeType: 'image/jpeg',
        byteSize: 4,
        blobKey: 'cover:mangadex:manga-1',
      });
    });
    const original = Uint8Array.from(snapshot);
    const directory = scratch();
    const { client } = host(directory);

    const result = await client.open(snapshot, [
      { id: 'cover:mangadex:manga-1', blobKey: 'page:cover:mangadex:manga-1' },
    ]);
    expect(result.ok && result.value.imported?.tables.cache_entries).toBe(1);
    expect((await getCacheEntryById(client.handle, 'cover:mangadex:manga-1'))?.blobKey).toBe(
      'page:cover:mangadex:manga-1',
    );
    // The caller's snapshot bytes were not touched.
    expect(snapshot).toEqual(original);
  }, 30_000);

  it('rewrites an existing database pointer in one transaction', async () => {
    const { client } = host(scratch());
    await client.open(null);
    await upsertCacheEntry(client.handle, {
      id: 'page:m:c:0',
      providerId: 'mangadex',
      mangaId: 'm',
      chapterId: 'c',
      cacheKind: 'page',
      blobKey: 'cover:mangadex:m',
    });
    await expect(
      rewriteCacheBlobKeys(client.handle, [
        { id: 'page:m:c:0', blobKey: 'page:cover:mangadex:m' },
        { id: 'missing', blobKey: 'page:cover:x:y' },
      ]),
    ).resolves.toBe(1);
    expect((await getCacheEntryById(client.handle, 'page:m:c:0'))?.blobKey).toBe(
      'page:cover:mangadex:m',
    );
  });

  it('refuses to remove a directory sitting at an import scratch path', async () => {
    const directory = scratch();
    const snapshot = await rendererSnapshot();
    mkdirSync(join(directory, 'library.sqlite.import-source'));
    const { client } = host(directory);
    const failed = await client.open(snapshot);
    expect(failed).toMatchObject({ ok: false, error: { code: DATA_HOST_ERROR.importFailed } });
    // The guard must not delete a directory it did not create.
    expect(readdirSync(directory)).toContain('library.sqlite.import-source');
  }, 30_000);

  // Creating a symlink needs a privilege on Windows (EPERM/EACCES without developer mode); a
  // platform that refuses skips these two tests rather than failing the suite.
  function linkOrSkip(skip: () => never, target: string, path: string): void {
    try {
      symlinkSync(target, path);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code === 'EPERM' || code === 'EACCES') skip();
      throw error;
    }
  }

  it('unlinks a dangling symlink at an import scratch path instead of writing through it', async (ctx) => {
    const directory = scratch();
    const outside = scratch();
    const linkTarget = join(outside, 'escaped.sqlite');
    linkOrSkip(() => ctx.skip(), linkTarget, join(directory, 'library.sqlite.import-source'));
    const { client } = host(directory);

    const result = await client.open(await rendererSnapshot());

    expect(result.ok && result.value.imported?.tables.library_entries).toBe(3);
    // The link was removed, not followed: nothing was created where it pointed.
    expect(existsSync(linkTarget)).toBe(false);
    expect(readdirSync(outside)).toEqual([]);
    expect(readdirSync(directory).filter((name) => name.includes('.import-'))).toEqual([]);
  }, 30_000);

  it('leaves a file outside the scratch path untouched when a symlink points at it', async (ctx) => {
    const directory = scratch();
    const outside = scratch();
    const victim = join(outside, 'victim.txt');
    writeFileSync(victim, 'keep me');
    linkOrSkip(() => ctx.skip(), victim, join(directory, 'library.sqlite.import-source'));
    const { client } = host(directory);

    const result = await client.open(await rendererSnapshot());

    expect(result.ok && result.value.imported?.tables.library_entries).toBe(3);
    expect(readFileSync(victim, 'utf8')).toBe('keep me');
  }, 30_000);

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
  }, 30_000);

  // Once the rename succeeds the native database exists, so a failure writing the marker or
  // removing scratch files must not be reported as `import_failed` (the renderer would then keep
  // writing to sql.js while the next start opens the native file without importing again).
  it('still imports when the marker cannot be written after the rename', async () => {
    const directory = scratch();
    const { client } = host(directory);
    faults.marker = true;

    const result = await client.open(await rendererSnapshot());

    expect(result.ok && result.value.imported?.tables.library_entries).toBe(3);
    expect(existsSync(join(directory, 'library.sqlite'))).toBe(true);
    expect(await listLibraryEntries(client.handle)).toHaveLength(3);
    expect(await client.status()).toEqual({
      ok: true,
      value: { open: true, nativeExists: true },
    });
  }, 30_000);

  it('still imports when scratch cleanup fails after the rename', async () => {
    const directory = scratch();
    const { client } = host(directory);
    faults.scratch = true;

    const result = await client.open(await rendererSnapshot());

    expect(result.ok && result.value.imported?.tables.library_entries).toBe(3);
    expect(existsSync(join(directory, 'library.sqlite'))).toBe(true);
    expect(await listLibraryEntries(client.handle)).toHaveLength(3);
    // The stuck scratch file is harmless: the next import removes it first.
    expect(faults.scratch).toBe(false);
  }, 30_000);

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
