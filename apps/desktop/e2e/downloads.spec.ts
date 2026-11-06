import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { showReaderControls } from './reader-controls.js';

// #222 on the production build: download a chapter, kill the app mid-download, reopen and
// resume, read it offline from page:// files, remove it, and prove a real cache eviction keeps
// downloads while ordinary pages leave.

test.describe.configure({ timeout: 240_000 });

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const fixturesDir = join(desktopRoot, '../../packages/extensions/src/mangadex/fixtures');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const DATABASE = 'mangaverse.sqlite';
const MANGADEX_MANGA_ID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
const CHAPTER_TITLE = 'Ch. 1 - The Summoner';
const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
const PAGE_COUNT = 37;
// Reader pages ask main for the Auto display copy (display downscale, spec 07).
const PAGE_URL = /^page:\/\/store\/[0-9a-f]{64}\?display=2048$/;
const IMAGE_DELAY_MS = 60;

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

const cleanups: (() => void | Promise<void>)[] = [];

test.afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await Promise.resolve(cleanup()).catch(() => undefined);
  }
});

const fixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf8');

interface FixtureServer {
  readonly origin: string;
  pageImages(): number;
  close(): Promise<void>;
}

/** The recorded MangaDex API and image CDN, with page images slowed enough to kill mid-run. */
async function startFixtureServer(): Promise<FixtureServer> {
  const atHome = JSON.parse(fixture('at-home.json')) as { baseUrl: string };
  const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
  let pageImages = 0;
  let closed = false;

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.local');
    if (url.pathname.startsWith('/data')) {
      pageImages += 1;
      setTimeout(() => {
        if (!closed && !response.destroyed) {
          response.writeHead(200, { 'content-type': 'image/jpeg' }).end(jpeg);
        }
      }, IMAGE_DELAY_MS);
      return;
    }
    if (url.pathname.startsWith('/covers/')) {
      response.writeHead(200, { 'content-type': 'image/jpeg' }).end(jpeg);
      return;
    }
    const body = url.pathname.includes('/at-home/server/')
      ? JSON.stringify(atHome)
      : /\/manga\/[^/]+\/feed/.test(url.pathname)
        ? fixture('feed.json')
        : /\/manga\/[^/]+$/.test(url.pathname)
          ? fixture('detail.json')
          : fixture('search.json');
    response.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no fixture port');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    pageImages: () => pageImages,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      });
    },
  };
}

/** A profile with onboarding finished; the fixture title arrives from the provider. */
async function seededProfile(): Promise<{ userDataDir: string; mangaId: string }> {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-downloads-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const host = await import(pathToFileURL(join(dbPackageRoot, 'dist/host/index.js')).href);
  const db = await import(pathToFileURL(join(dbPackageRoot, 'dist/index.js')).href);
  const native = host.openNativeDatabase(join(directory, DATABASE));
  const now = new Date().toISOString();
  await db.upsertAppSetting(native.db, 'onboarding', {
    status: 'completed',
    currentStep: 'provider',
    completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
    startedAt: now,
    completedAt: now,
  });
  native.close();
  return { userDataDir: directory, mangaId: `dev-md-${MANGADEX_MANGA_ID}` };
}

async function launch(
  userDataDir: string,
  fixtureOrigin: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  env.MANGAVERSE_E2E_PROVIDER_FIXTURE = fixtureOrigin;
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot, `--user-data-dir=${userDataDir}`],
    env,
  });
  cleanups.unshift(async () => {
    await app.close().catch(() => undefined);
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

function query<T>(userDataDir: string, sql: string): T[] {
  const database = new DatabaseSync(join(userDataDir, DATABASE), { readOnly: true });
  const rows = database.prepare(sql).all() as T[];
  database.close();
  return rows;
}

interface DownloadRow {
  readonly chapter_id: string;
  readonly status: string;
  readonly page_count: number;
  readonly completed_pages: number;
  readonly failed_page_indexes_json: string | null;
  readonly last_error_code: string | null;
}

const downloadRows = (userDataDir: string) =>
  query<DownloadRow>(
    userDataDir,
    'SELECT chapter_id, status, page_count, completed_pages, failed_page_indexes_json, last_error_code FROM downloads',
  );

const downloadPageRows = (userDataDir: string) =>
  query<{ blob_key: string; byte_size: number }>(
    userDataDir,
    `SELECT blob_key, byte_size FROM cache_entries
     WHERE cache_kind = 'page'
       AND json_extract(metadata_json, '$.retention') = 'download'
     ORDER BY blob_key`,
  );

function storedPages(userDataDir: string): string[] {
  const directory = join(userDataDir, 'pages');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^[0-9a-f]{64}$/.test(name))
    .sort((left, right) => left.localeCompare(right));
}

/** The page-store file name for a blob key; covers share the store, so assertions use ids. */
const pageFileId = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');

const storedDownloadPageIds = (userDataDir: string) =>
  downloadPageRows(userDataDir).map((row) => pageFileId(row.blob_key));

function hasPageFiles(userDataDir: string, ids: readonly string[]): boolean {
  const stored = new Set(storedPages(userDataDir));
  return ids.every((id) => stored.has(id));
}

const readerImage = (page: Page) => page.getByTestId('reader-surface').locator('img').first();

async function expectPageRendered(page: Page): Promise<string> {
  const image = readerImage(page);
  await expect
    .poll(
      async () => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      { timeout: 20_000 },
    )
    .toBe(true);
  const src = await image.getAttribute('src');
  expect(src).toMatch(PAGE_URL);
  return src!;
}

async function openTitle(page: Page, mangaId: string): Promise<void> {
  await page.goto(`app://app/manga/${mangaId}`);
  await expect(page.getByRole('button', { name: CHAPTER_BUTTON }).first()).toBeVisible({
    timeout: 30_000,
  });
}

test('Given a download interrupted by a kill, When the app reopens, Then it resumes, reads offline, and removes cleanly', async () => {
  const { userDataDir, mangaId } = await seededProfile();
  const fixtureServer = await startFixtureServer();
  cleanups.unshift(() => fixtureServer.close());
  const first = await launch(userDataDir, fixtureServer.origin);

  await openTitle(first.page, mangaId);
  await first.page.getByRole('button', { name: 'Download chapter 1' }).click();

  // Kill while pages are still landing: at least one, not the whole chapter.
  await expect
    .poll(() => downloadRows(userDataDir)[0]?.completed_pages ?? 0, {
      timeout: 30_000,
      intervals: [20],
    })
    .toBeGreaterThan(0);
  const beforeKill = downloadRows(userDataDir)[0]!;
  first.app.process().kill('SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(beforeKill.status).toBe('downloading');
  expect(beforeKill.page_count).toBe(PAGE_COUNT);
  expect(beforeKill.completed_pages).toBeLessThan(PAGE_COUNT);
  const pagesAtKill = downloadPageRows(userDataDir).length;
  expect(pagesAtKill).toBeGreaterThanOrEqual(beforeKill.completed_pages);
  expect(pagesAtKill).toBeLessThan(PAGE_COUNT);

  // Reopen the same profile: the queue resumes the same row, not a fresh one.
  const imagesBeforeReopen = fixtureServer.pageImages();
  const second = await launch(userDataDir, fixtureServer.origin);
  await expect
    .poll(() => downloadRows(userDataDir)[0]?.status, { timeout: 60_000 })
    .toBe('complete');
  const finished = downloadRows(userDataDir)[0]!;
  expect(finished).toMatchObject({
    page_count: PAGE_COUNT,
    completed_pages: PAGE_COUNT,
    failed_page_indexes_json: '[]',
    last_error_code: null,
  });
  // Resume fetched only what was missing (plus at most the four in flight at the kill).
  const fetchedAfterReopen = fixtureServer.pageImages() - imagesBeforeReopen;
  expect(fetchedAfterReopen).toBeGreaterThanOrEqual(PAGE_COUNT - pagesAtKill);
  expect(fetchedAfterReopen).toBeLessThanOrEqual(PAGE_COUNT - pagesAtKill + 4);
  expect(downloadPageRows(userDataDir)).toHaveLength(PAGE_COUNT);
  expect(hasPageFiles(userDataDir, storedDownloadPageIds(userDataDir))).toBe(true);

  // Offline: no API, no CDN, no network at all.
  await fixtureServer.close();
  await second.app.evaluate(({ session }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  await openTitle(second.page, mangaId);
  await second.page.getByRole('button', { name: CHAPTER_BUTTON }).first().click({ force: true });
  await expect(second.page.getByText(`1 / ${PAGE_COUNT}`)).toBeVisible({ timeout: 30_000 });
  const firstPage = await expectPageRendered(second.page);
  await showReaderControls(second.page);
  await second.page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(second.page.getByText(`2 / ${PAGE_COUNT}`)).toBeVisible();
  const secondPage = await expectPageRendered(second.page);
  expect(new Set([firstPage, secondPage]).size).toBe(2);

  // Remove it: rows, blobs and the Storage totals all agree.
  await second.page.goto('app://app/storage');
  await expect(second.page.getByText('Protected downloads')).toBeVisible({ timeout: 20_000 });
  const removedIds = storedDownloadPageIds(userDataDir);
  await second.page.getByRole('button', { name: `Remove download: ${CHAPTER_TITLE}` }).click();
  await expect(second.page.getByText(/Removed the download: 37 pages freed\./)).toBeVisible({
    timeout: 20_000,
  });
  expect(downloadRows(userDataDir)).toEqual([]);
  expect(downloadPageRows(userDataDir)).toEqual([]);
  expect(hasPageFiles(userDataDir, removedIds)).toBe(false);
  await expect(second.page.getByText('No downloads yet.')).toBeVisible();
});

/** Ordinary page bytes and rows, written before launch as a pre-existing read cache. */
async function seedOrdinaryCache(
  userDataDir: string,
  pages: number,
  bytesEach: number,
): Promise<string[]> {
  const directory = join(userDataDir, 'pages');
  mkdirSync(directory, { recursive: true });
  const database = new DatabaseSync(join(userDataDir, DATABASE));
  const keys: string[] = [];
  const payload = Buffer.alloc(bytesEach, 7);
  for (let index = 0; index < pages; index += 1) {
    const key = `page:fixture:seed-manga:seed-chapter:${index}`;
    const id = createHash('sha256').update(key, 'utf8').digest('hex');
    writeFileSync(join(directory, id), payload);
    writeFileSync(
      join(directory, `${id}.json`),
      JSON.stringify({
        key,
        mimeType: 'image/jpeg',
        sha256: createHash('sha256').update(payload).digest('hex'),
      }),
    );
    database
      .prepare(
        `INSERT INTO cache_entries
           (id, provider_id, manga_id, chapter_id, cache_kind, last_access_at,
            mime_type, byte_size, blob_key, metadata_json)
         VALUES (?, 'fixture', 'seed-manga', 'seed-chapter', 'page',
                 '2026-01-01T00:00:00.000Z', 'image/jpeg', ?, ?, ?)`,
      )
      .run(key, bytesEach, key, JSON.stringify({ pageIndex: index, retention: 'normal' }));
    keys.push(key);
  }
  database
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES ('global', ?, '2026-01-01T00:00:00.000Z')
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
    )
    .run(
      JSON.stringify({
        explicitContent: false,
        showProviderErrors: true,
        preferredLanguages: ['en'],
        lowMemoryMode: false,
        reduceMotion: false,
        reduceTransparency: false,
        locale: 'system',
        // The smallest limit the product allows, 50 MiB.
        imageCacheLimitBytes: 52_428_800,
      }),
    );
  database.close();
  return keys;
}

test('Given downloads over the cache limit, When the app opens, Then ordinary pages are evicted and downloads stay', async () => {
  const { userDataDir, mangaId } = await seededProfile();
  const fixtureServer = await startFixtureServer();
  cleanups.unshift(() => fixtureServer.close());
  const first = await launch(userDataDir, fixtureServer.origin);

  await openTitle(first.page, mangaId);
  await first.page.getByRole('button', { name: 'Download chapter 1' }).click();
  await expect
    .poll(() => downloadRows(userDataDir)[0]?.status, { timeout: 60_000 })
    .toBe('complete');
  await first.app.close();

  // A 60 MB ordinary cache, seeded before the app opens with the 50 MiB limit.
  const seededKeys = await seedOrdinaryCache(userDataDir, 60, 1024 * 1024);
  // The title cover shares the page store, so the seeded chapter adds its own files.
  expect(storedPages(userDataDir)).toHaveLength(PAGE_COUNT + seededKeys.length + 1);

  const second = await launch(userDataDir, fixtureServer.origin);
  await expect
    .poll(
      () =>
        query<{ n: number }>(
          userDataDir,
          "SELECT COUNT(*) AS n FROM cache_entries WHERE manga_id = 'seed-manga'",
        )[0]?.n ?? -1,
      { timeout: 60_000 },
    )
    .toBe(0);

  expect(downloadRows(userDataDir)[0]?.status).toBe('complete');
  expect(downloadPageRows(userDataDir)).toHaveLength(PAGE_COUNT);
  expect(hasPageFiles(userDataDir, storedDownloadPageIds(userDataDir))).toBe(true);
  const totals = query<{ bytes: number; count: number }>(
    userDataDir,
    `SELECT COALESCE(SUM(byte_size), 0) AS bytes, COUNT(*) AS count FROM cache_entries
     WHERE json_extract(metadata_json, '$.retention') = 'download'`,
  )[0]!;
  expect(totals.count).toBe(PAGE_COUNT);

  // Storage agrees: one download, no reclaimable cache.
  await second.page.goto('app://app/storage');
  await expect(second.page.getByText('Protected downloads')).toBeVisible({ timeout: 20_000 });
  await expect(second.page.getByText('Reclaimable cache')).toBeVisible();
  await expect(second.page.getByText('No downloads yet.')).not.toBeVisible();
  const downloadItems = query<{ chapter_id: string }>(
    userDataDir,
    `SELECT chapter_id FROM downloads WHERE status = 'complete'`,
  );
  expect(downloadItems).toHaveLength(1);
});
