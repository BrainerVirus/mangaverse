import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

// #212 on the production build: reader pages become files under the profile's page store, the
// reader shows them from page://<opaque id>, and they still render, page after page, offline.

test.describe.configure({ timeout: 180_000 });

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const fixturesDir = join(desktopRoot, '../../packages/extensions/src/mangadex/fixtures');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const DATABASE = 'mangaverse.sqlite';
const MANGADEX_MANGA_ID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
const PAGE_COUNT = 37;
const PAGES_READ = 6;
const PAGE_URL = /^page:\/\/store\/[0-9a-f]{64}$/;

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

const cleanups: (() => void)[] = [];

test.afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const fixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf8');

/** A profile with onboarding finished; the fixture title arrives from the provider. */
async function seededProfile(): Promise<{ userDataDir: string; mangaId: string }> {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-pages-'));
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
  if (!existsSync(join(desktopRoot, 'dist/renderer/index.html'))) {
    throw new Error('Build the desktop app first: pnpm --filter @app/desktop build');
  }
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  env.MANGAVERSE_E2E_PROVIDER_FIXTURE = fixtureOrigin;
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot, `--user-data-dir=${userDataDir}`],
    env,
  });
  cleanups.unshift(() => void app.close().catch(() => undefined));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

interface FixtureServer {
  readonly origin: string;
  images(): number;
  close(): Promise<void>;
}

/**
 * The recorded MangaDex API and image CDN for main's fixture transport. Main still
 * runs the allowlist, address and redirect checks; only the socket target is local.
 */
async function startFixtureServer(): Promise<FixtureServer> {
  const atHome = JSON.parse(fixture('at-home.json')) as { baseUrl: string };
  const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
  let imageCount = 0;
  let closed = false;

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.local');
    if (url.pathname.startsWith('/covers/') || url.pathname.startsWith('/data')) {
      imageCount += 1;
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
    images: () => imageCount,
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

/** Every console error and page error the renderer raises from here on. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

function query<T>(userDataDir: string, sql: string): T[] {
  const database = new DatabaseSync(join(userDataDir, DATABASE), { readOnly: true });
  const rows = database.prepare(sql).all() as T[];
  database.close();
  return rows;
}

const pageRows = (userDataDir: string) =>
  query<{ blob_key: string; byte_size: number; mime_type: string }>(
    userDataDir,
    "SELECT blob_key, byte_size, mime_type FROM cache_entries WHERE cache_kind = 'page' ORDER BY blob_key",
  );

/** The page store directory: one bytes file and one `.json` sidecar per page. */
function storedPages(userDataDir: string): { bytes: string[]; sidecars: string[] } {
  const directory = join(userDataDir, 'pages');
  const names = existsSync(directory) ? readdirSync(directory) : [];
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    bytes: names.filter((name) => /^[0-9a-f]{64}$/.test(name)).sort(byName),
    sidecars: names.filter((name) => /^[0-9a-f]{64}\.json$/.test(name)).sort(byName),
  };
}

/** Keys in the renderer's IndexedDB blob store that name a page. */
function indexedDbPageKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('mangaverse-blobs');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('blobs')) {
            db.close();
            resolve([]);
            return;
          }
          const keys = db.transaction('blobs').objectStore('blobs').getAllKeys();
          keys.onerror = () => reject(keys.error);
          keys.onsuccess = () => {
            db.close();
            resolve(keys.result.map(String).filter((key) => key.startsWith('page:')));
          };
        };
      }),
  );
}

const readerImage = (page: Page) => page.getByTestId('reader-surface').locator('img').first();

async function expectPageRendered(page: Page): Promise<string> {
  const image = readerImage(page);
  await expect
    .poll(
      async () => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      {
        timeout: 20_000,
      },
    )
    .toBe(true);
  const src = await image.getAttribute('src');
  expect(src).toMatch(PAGE_URL);
  return src!;
}

async function readPages(page: Page): Promise<string[]> {
  const sources = [await expectPageRendered(page)];
  for (let index = 2; index <= PAGES_READ; index += 1) {
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.getByText(`${index} / ${PAGE_COUNT}`)).toBeVisible();
    sources.push(await expectPageRendered(page));
  }
  return sources;
}

test('Given a chapter read online, When reopened offline, Then its pages render from page:// files', async () => {
  const { userDataDir, mangaId } = await seededProfile();
  const fixtureServer = await startFixtureServer();
  cleanups.unshift(() => void fixtureServer.close());
  const { app, page } = await launch(userDataDir, fixtureServer.origin);
  const errors = watchErrors(page);

  // Online: open the chapter and read the first pages.
  await page.goto(`app://app/manga/${mangaId}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText(`1 / ${PAGE_COUNT}`)).toBeVisible({ timeout: 30_000 });
  const onlineSources = await readPages(page);
  expect(new Set(onlineSources).size).toBe(PAGES_READ);
  for (const src of onlineSources) expect(src).not.toContain(userDataDir);
  expect(fixtureServer.images()).toBeGreaterThanOrEqual(PAGES_READ);

  // Main holds the bytes; SQLite holds only metadata rows; IndexedDB holds no page.
  await expect.poll(() => storedPages(userDataDir).bytes.length).toBeGreaterThanOrEqual(PAGES_READ);
  // Prefetch keeps writing the pages after the ones read, and a put lays its bytes down before
  // its sidecar (#312), so a listing taken mid-write sees bytes whose sidecar is not there yet.
  // Wait for the writes to settle: every page file, and only those, ends up beside its sidecar.
  await expect
    .poll(
      () => {
        const { bytes, sidecars } = storedPages(userDataDir);
        const named = sidecars.map((name) => name.slice(0, 64));
        return {
          withoutSidecar: bytes.filter((name) => !named.includes(name)),
          withoutBytes: named.filter((name) => !bytes.includes(name)),
        };
      },
      { timeout: 10_000 },
    )
    .toEqual({ withoutSidecar: [], withoutBytes: [] });
  const stored = storedPages(userDataDir);
  const rows = pageRows(userDataDir);
  // Prefetch may still be writing the next pages; every committed row has its file.
  expect(rows.length).toBeGreaterThanOrEqual(PAGES_READ);
  expect(rows.length).toBeLessThanOrEqual(stored.bytes.length);
  for (const row of rows) {
    expect(row).toMatchObject({
      mime_type: 'image/jpeg',
      byte_size: Buffer.from(TINY_JPEG_BASE64, 'base64').byteLength,
    });
    expect(row.blob_key).toMatch(/^page:/);
  }
  expect(
    query<{ name: string; type: string }>(userDataDir, 'PRAGMA table_info(cache_entries)').map(
      (column) => column.type.toUpperCase(),
    ),
  ).not.toContain('BLOB');
  expect(await indexedDbPageKeys(page)).toEqual([]);

  // A request no app frame made has no initiator and is refused.
  expect(
    await app.evaluate(
      ({ net }, src) => net.fetch(src).then((response) => response.status),
      onlineSources[0]!,
    ),
  ).toBe(403);

  // Offline: no API, no CDN, no network at all. Reload the reader.
  const servedOnline = fixtureServer.images();
  await fixtureServer.close();
  await app.evaluate(({ session }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  const offlineErrorsFrom = errors.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(`1 / ${PAGE_COUNT}`)).toBeVisible({ timeout: 30_000 });
  const offlineSources = await readPages(page);
  expect(offlineSources).toEqual(onlineSources);
  expect(fixtureServer.images()).toBe(servedOnline);
  // Provider calls that fail offline are expected noise; nothing about pages may error.
  expect(
    errors
      .slice(offlineErrorsFrom)
      .filter((text) => /page:|Content Security Policy|Refused/i.test(text)),
  ).toEqual([]);

  // Clearing the cache removes every page file together with its row.
  await page.goto('app://app/storage');
  await page.getByRole('button', { name: 'Clear provider cache' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText(/Cleared \d+ cache entries\./)).toBeVisible({ timeout: 20_000 });
  expect(pageRows(userDataDir)).toEqual([]);
  expect(storedPages(userDataDir)).toEqual({ bytes: [], sidecars: [] });

  expect(
    errors.filter((text) => /page:|Content Security Policy|Refused to load/i.test(text)),
  ).toEqual([]);

  // The renderer cannot fetch page:// at all: CSP connect-src has no page: source, which is
  // stronger than a status. Probe last so its deliberate CSP error is not counted above; the
  // handler's refusal matrix is covered by unit tests.
  const fetchBlocked = await page.evaluate(async (src) => {
    try {
      await fetch(src);
      return 'allowed';
    } catch {
      return 'blocked';
    }
  }, onlineSources[0]!);
  expect(fetchBlocked).toBe('blocked');
});
