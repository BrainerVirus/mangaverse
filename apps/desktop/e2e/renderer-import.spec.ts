import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

// #213 on the production build: a pre-data-host profile keeps its sql.js snapshot, cached
// pages, covers and custom cover in IndexedDB. The first start moves them into main's page
// store, rewrites the cache pointers, verifies every blob, and records the one-way marker.

test.describe.configure({ timeout: 180_000 });

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const DATABASE = 'mangaverse.sqlite';
const MARKER = `${DATABASE}.import-renderer.json`;
const CUSTOM_COVER = 'https://example.com/custom-cover.jpg';
const PROVIDER = 'mangadex';

// A 1x1 JPEG; the store only accepts real image bytes.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

const cleanups: (() => void)[] = [];

test.afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function profile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-renderer-import-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  if (!existsSync(join(desktopRoot, 'dist/renderer/index.html'))) {
    throw new Error('Build the desktop app first: pnpm --filter @app/desktop build');
  }
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot, `--user-data-dir=${userDataDir}`],
    env,
  });
  cleanups.unshift(() => void app.close().catch(() => undefined));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  // The profile is local: no provider traffic at all.
  await app.evaluate(({ session }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  return { app, page };
}

function query<T>(userDataDir: string, sql: string): T[] {
  const database = new DatabaseSync(join(userDataDir, DATABASE), { readOnly: true });
  const rows = database.prepare(sql).all() as T[];
  database.close();
  return rows;
}

interface OldProfile {
  readonly bytes: Uint8Array;
  readonly mangaId: string;
  readonly chapterId: string;
  readonly pageBlobKey: string;
  readonly coverBlobKey: string;
  readonly coverPageKey: string;
}

/** A snapshot made the way the web renderer made one, with a title, chapter and cover row. */
async function oldSnapshot(): Promise<OldProfile> {
  const require = createRequire(join(dbPackageRoot, 'package.json'));
  const initSqlJs = require('sql.js') as (options?: object) => Promise<{
    Database: new () => { exec(sql: string): unknown[]; export(): Uint8Array; close(): void };
  }>;
  const db = await import(pathToFileURL(join(dbPackageRoot, 'dist/index.js')).href);
  const folder = join(dbPackageRoot, 'migrations');
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
  const files = journal.entries.map((entry: { tag: string }) => {
    const sql = readFileSync(join(folder, `${entry.tag}.sql`), 'utf8');
    return { tag: entry.tag, sql, hash: createHash('sha256').update(sql).digest('hex') };
  });
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  db.migrateDatabaseFromBundled(raw, journal, files);
  const drizzle = db.createDrizzleFromSqlJs(raw);

  const identity = await db.createMangaIdentityWithInitialMapping(drizzle, {
    canonicalTitle: 'Old Profile Title',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: PROVIDER,
    providerMangaId: 'old-profile-title',
  });
  if (!identity.ok) throw new Error(identity.error.message);
  const { mangaId } = identity.value;
  await db.addLibraryEntry(drizzle, { mangaId, status: 'reading' });
  await db.setMangaCoverOverride(drizzle, mangaId, CUSTOM_COVER);

  const chapter = await db.upsertChapterWithPages(drizzle, {
    mangaId,
    providerMappingId: identity.value.mappingId,
    providerId: PROVIDER,
    providerChapterId: 'old-chapter-1',
    title: 'The Old Chapter',
    index: 1,
    pages: [
      {
        id: 'page-0',
        index: 0,
        image: { url: 'https://example.com/old-page-0.jpg', mimeType: 'image/jpeg' },
      },
    ],
  });
  if (!chapter.ok) throw new Error(chapter.error.message);
  const chapterId = chapter.value;

  const pageBlobKey = `page:${PROVIDER}:${mangaId}:${chapterId}:0`;
  const coverBlobKey = `cover:${PROVIDER}:${mangaId}`;
  const coverPageKey = `page:${coverBlobKey}`;
  await db.upsertCacheEntry(drizzle, {
    id: pageBlobKey,
    providerId: PROVIDER,
    mangaId,
    chapterId,
    cacheKind: 'page',
    sourceUrl: 'https://example.com/old-page-0.jpg',
    mimeType: 'image/jpeg',
    byteSize: TINY_JPEG.byteLength,
    blobKey: pageBlobKey,
  });
  await db.upsertCacheEntry(drizzle, {
    id: coverBlobKey,
    providerId: PROVIDER,
    mangaId,
    cacheKind: 'cover',
    sourceUrl: CUSTOM_COVER,
    mimeType: 'image/jpeg',
    byteSize: TINY_JPEG.byteLength,
    blobKey: coverBlobKey,
  });
  await db.upsertAppSetting(drizzle, 'onboarding', {
    status: 'completed',
    currentStep: 'provider',
    completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
  await db.upsertChapterReadState(drizzle, {
    chapterId,
    mangaId,
    progress: { readPercent: 0, lastPageIndex: 0, completed: false },
  });

  const bytes = raw.export();
  raw.close();
  return { bytes, mangaId, chapterId, pageBlobKey, coverBlobKey, coverPageKey };
}

function writeSnapshot(page: Page, bytes: Uint8Array): Promise<void> {
  return page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('mangaverse-local-db', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('snapshots');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('snapshots', 'readwrite');
          tx.objectStore('snapshots').put({ bytes: Uint8Array.from(data), version: 1 }, 'main');
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [...bytes],
  );
}

function writeBlobs(page: Page, blobs: Record<string, string>): Promise<void> {
  return page.evaluate(
    async (entries) => {
      const bytes = Uint8Array.from(atob(entries.jpeg), (char) => char.charCodeAt(0));
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('mangaverse-blobs', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('blobs');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('blobs', 'readwrite');
          for (const key of entries.keys) {
            tx.objectStore('blobs').put(
              { data: bytes.slice().buffer, mimeType: 'image/jpeg' },
              key,
            );
          }
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { jpeg: TINY_JPEG.toString('base64'), keys: blobs.keys },
  );
}

function idbKeys(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(
    (name) =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('mangaverse-blobs', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          if (!database.objectStoreNames.contains('blobs')) {
            database.close();
            resolve([]);
            return;
          }
          const request = database.transaction('blobs').objectStore('blobs').getAllKeys();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            database.close();
            resolve(request.result.map(String).filter((key) => key.startsWith(name)));
          };
        };
      }),
    prefix,
  );
}

/** Deletes the named blobs from the profile's IndexedDB, as cache maintenance would. */
function deleteBlobs(page: Page, keys: readonly string[]): Promise<void> {
  return page.evaluate(
    (names) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('mangaverse-blobs', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          if (!database.objectStoreNames.contains('blobs')) {
            database.close();
            resolve();
            return;
          }
          const tx = database.transaction('blobs', 'readwrite');
          for (const name of names) tx.objectStore('blobs').delete(name);
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    keys,
  );
}

/** Seeds a pre-data-host profile and removes the native file a first start may have made. */
async function seedOldProfile(): Promise<{ userDataDir: string; profile: OldProfile }> {
  const userDataDir = profile();
  const seeded = await launch(userDataDir);
  const profileData = await oldSnapshot();
  await writeSnapshot(seeded.page, profileData.bytes);
  await writeBlobs(seeded.page, {
    keys: [profileData.pageBlobKey, profileData.coverBlobKey],
  });
  await seeded.app.close();
  // The seeding launch itself wrote an empty native database and marker; a pre-data-host
  // profile has neither, so both are removed.
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(join(userDataDir, `${DATABASE}${suffix}`), { force: true });
  }
  rmSync(join(userDataDir, MARKER), { force: true });
  return { userDataDir, profile: profileData };
}

const storedFiles = (userDataDir: string): string[] => {
  const directory = join(userDataDir, 'pages');
  return existsSync(directory) ? readdirSync(directory) : [];
};

const coverImage = (page: Page) => page.locator(`img[data-cover-url="${CUSTOM_COVER}"]`).first();

test('an old profile moves its snapshot, pages and custom cover once, then skips', async () => {
  const { userDataDir, profile: old } = await seedOldProfile();
  const { page } = await launch(userDataDir);

  await page.goto('app://app/library');
  await expect(page.getByText('Old Profile Title').first()).toBeVisible({ timeout: 30_000 });

  // The custom cover is served from the page store, not the old IndexedDB bytes.
  const cover = coverImage(page);
  await expect
    .poll(async () => cover.getAttribute('src'), { timeout: 20_000 })
    .toMatch(/^page:\/\/store\/[0-9a-f]{64}$/);
  const coverSrc = await cover.getAttribute('src');

  // The cached row now points at the page-store file.
  expect(
    query<{ blob_key: string }>(
      userDataDir,
      `SELECT blob_key FROM cache_entries WHERE id = '${old.coverBlobKey}'`,
    ),
  ).toEqual([{ blob_key: old.coverPageKey }]);
  expect(storedFiles(userDataDir).filter((name) => /^[0-9a-f]{64}\.json$/.test(name))).toHaveLength(
    2,
  );

  // The old page stays in IndexedDB; the old cover copy may be reclaimed only now, after the
  // marker, because normal cache maintenance no longer sees a row pointing at it.
  expect(await idbKeys(page, 'page:')).toEqual([old.pageBlobKey]);
  const marker = JSON.parse(readFileSync(join(userDataDir, MARKER), 'utf8')) as {
    blobs: { pages: number; covers: number };
    pointerRewrites: number;
    database: { totalRows: number } | null;
  };
  expect(marker).toMatchObject({ pointerRewrites: 1 });
  expect(marker.blobs).toMatchObject({ pages: 1, covers: 1 });
  expect(marker.database?.totalRows).toBeGreaterThan(0);

  // The reader shows the moved page from page://.
  await page.goto(`app://app/reader/${old.chapterId}`);
  const readerImage = page.getByTestId('reader-surface').locator('img').first();
  await expect
    .poll(
      async () =>
        readerImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      { timeout: 20_000 },
    )
    .toBe(true);
  // Auto display downscale asks main for a capped copy of the same stored page.
  expect(await readerImage.getAttribute('src')).toMatch(
    /^page:\/\/store\/[0-9a-f]{64}\?display=2048$/,
  );
  expect(coverSrc).toMatch(/^page:\/\/store\//);

  // A second start does not move anything again: the marker is rewritten only by an import.
  const markerText = readFileSync(join(userDataDir, MARKER), 'utf8');
  const files = storedFiles(userDataDir);
  await page.reload();
  await expect(page.getByTestId('reader-surface')).toBeVisible({ timeout: 30_000 });
  expect(readFileSync(join(userDataDir, MARKER), 'utf8')).toBe(markerText);
  expect(storedFiles(userDataDir)).toEqual(files);
});

test('a marker whose native database is gone keeps the custom cover already in the store', async () => {
  const { userDataDir, profile: old } = await seedOldProfile();
  const first = await launch(userDataDir);
  await first.page.goto('app://app/library');
  await expect(first.page.getByText('Old Profile Title').first()).toBeVisible({ timeout: 30_000 });
  const firstCover = coverImage(first.page);
  await expect
    .poll(async () => firstCover.getAttribute('src'), { timeout: 20_000 })
    .toMatch(/^page:\/\/store\/[0-9a-f]{64}$/);
  const keptCoverSrc = await firstCover.getAttribute('src');
  const filesAfterImport = storedFiles(userDataDir).sort();
  expect(filesAfterImport.filter((name) => /^[0-9a-f]{64}\.json$/.test(name))).toHaveLength(2);
  expect(existsSync(join(userDataDir, MARKER))).toBe(true);

  // The verified state is lost: the native database is pruned while the marker stays, and the
  // IndexedDB cover copy is reclaimed now that the row points at the page-store file.
  await deleteBlobs(first.page, [old.coverBlobKey]);
  expect(await idbKeys(first.page, 'cover:')).toEqual([]);
  await first.app.close();
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(join(userDataDir, `${DATABASE}${suffix}`), { force: true });
  }
  expect(existsSync(join(userDataDir, DATABASE))).toBe(false);

  // The stale snapshot is imported again; its cover row still names the old IndexedDB key, but
  // the stored file is the custom cover, so the pointer must follow it rather than orphan it.
  const second = await launch(userDataDir);
  await second.page.goto('app://app/library');
  await expect(second.page.getByText('Old Profile Title').first()).toBeVisible({ timeout: 30_000 });

  const cover = coverImage(second.page);
  await expect
    .poll(async () => cover.getAttribute('src'), { timeout: 20_000 })
    .toMatch(/^page:\/\/store\/[0-9a-f]{64}$/);
  expect(await cover.getAttribute('src')).toBe(keptCoverSrc);
  expect(
    query<{ blob_key: string }>(
      userDataDir,
      `SELECT blob_key FROM cache_entries WHERE id = '${old.coverBlobKey}'`,
    ),
  ).toEqual([{ blob_key: old.coverPageKey }]);

  // Nothing was reclaimed: the cover file the rewrite names is the one that was already stored.
  await expect
    .poll(async () => storedFiles(userDataDir).sort(), { timeout: 20_000 })
    .toEqual(filesAfterImport);
  const marker = JSON.parse(readFileSync(join(userDataDir, MARKER), 'utf8')) as {
    blobs: { pages: number; covers: number };
    pointerRewrites: number;
  };
  expect(marker).toMatchObject({ pointerRewrites: 1 });
  expect(marker.blobs).toMatchObject({ pages: 1, covers: 0 });
});

test('a page-store write failure shows retry and export, keeps the old data, then retries', async () => {
  const { userDataDir, profile: old } = await seedOldProfile();
  // An unwritable page store: every moved blob fails before the database is touched.
  mkdirSync(join(userDataDir, 'pages'), { recursive: true });
  chmodSync(join(userDataDir, 'pages'), 0o555);
  cleanups.push(() => {
    const pages = join(userDataDir, 'pages');
    if (existsSync(pages)) chmodSync(pages, 0o755);
  });

  const { page } = await launch(userDataDir);
  await page.goto('app://app/library');

  await expect(page.getByText('Could not import your existing data')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Retry import' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export old data' })).toBeVisible();

  // Nothing was recorded and no native file was created; the old library still works.
  expect(existsSync(join(userDataDir, MARKER))).toBe(false);
  expect(existsSync(join(userDataDir, DATABASE))).toBe(false);
  await expect(page.getByText('Old Profile Title').first()).toBeVisible({ timeout: 30_000 });
  expect(await idbKeys(page, 'cover:')).toEqual([old.coverBlobKey]);

  // Fix the store, then the user-initiated retry completes the move and records the marker.
  chmodSync(join(userDataDir, 'pages'), 0o755);
  await page.getByRole('button', { name: 'Retry import' }).click();
  await expect(page.getByText('Could not import your existing data')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByText('Old Profile Title').first()).toBeVisible({ timeout: 30_000 });
  expect(existsSync(join(userDataDir, MARKER))).toBe(true);
  expect(
    query<{ blob_key: string }>(
      userDataDir,
      `SELECT blob_key FROM cache_entries WHERE id = '${old.coverBlobKey}'`,
    ),
  ).toEqual([{ blob_key: old.coverPageKey }]);
});
