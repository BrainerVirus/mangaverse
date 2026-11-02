import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

// The production build on the native data host (ADR 0001): the renderer never opens SQLite,
// and a profile's sql.js snapshot is imported once on the first start.

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const DATABASE = 'mangaverse.sqlite';

const cleanups: (() => void)[] = [];

test.afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function profile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-data-host-'));
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
  // No provider traffic: the flows here are local.
  await app.evaluate(({ session }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  return { app, page };
}

/** Reads the profile's native database the way an outside tool would, read-only. */
function query<T>(userDataDir: string, sql: string): T[] {
  const database = new DatabaseSync(join(userDataDir, DATABASE), { readOnly: true });
  const rows = database.prepare(sql).all() as T[];
  database.close();
  return rows;
}

function appSetting<T>(userDataDir: string, key: string): T | undefined {
  const [row] = query<{ value_json: string }>(
    userDataDir,
    `SELECT value_json FROM app_settings WHERE key = '${key}'`,
  );
  return row === undefined ? undefined : (JSON.parse(row.value_json) as T);
}

/** The renderer's sql.js snapshot slot in IndexedDB, as a hex digest (or null when empty). */
function snapshotDigest(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('mangaverse-local-db', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('snapshots');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result.transaction('snapshots').objectStore('snapshots').get('main');
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            const stored = read.result as { bytes: Uint8Array } | undefined;
            open.result.close();
            if (stored === undefined) return resolve(null);
            void crypto.subtle
              .digest('SHA-256', stored.bytes)
              .then((hash) =>
                resolve(
                  [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join(''),
                ),
              );
          };
        };
      }),
  );
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

async function finishOnboarding(page: Page): Promise<void> {
  await page.goto('app://app/library');
  await expect(page).toHaveURL('app://app/onboarding');
  for (let step = 0; step < 4; step += 1) {
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(next).toBeEnabled({ timeout: 20_000 });
    await next.click();
  }
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL('app://app/library', { timeout: 20_000 });
}

/** A snapshot made the way the web renderer makes one: sql.js and its bundled migrator. */
async function rendererSnapshot(
  adjust?: (raw: { exec(sql: string): unknown }) => void,
): Promise<{ bytes: Uint8Array; counts: Record<string, number> }> {
  const require = createRequire(join(dbPackageRoot, 'package.json'));
  const initSqlJs = require('sql.js') as (options?: object) => Promise<{
    Database: new () => {
      exec(sql: string): { values: unknown[][] }[];
      export(): Uint8Array;
      close(): void;
    };
  }>;
  const db = await import(pathToFileURL(join(dbPackageRoot, 'dist/browser.js')).href);
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
  for (const title of ['Imported Alpha', 'Imported Beta']) {
    const identity = await db.createMangaIdentityWithInitialMapping(drizzle, {
      canonicalTitle: title,
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'mangadex',
      providerMangaId: title.toLowerCase().replace(' ', '-'),
    });
    await db.addLibraryEntry(drizzle, { mangaId: identity.value.mangaId, status: 'reading' });
  }
  const now = new Date().toISOString();
  await db.upsertAppSetting(drizzle, 'onboarding', {
    status: 'completed',
    currentStep: 'provider',
    completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
    startedAt: now,
    completedAt: now,
  });
  adjust?.(raw);
  const tables = raw
    .exec(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'`,
    )[0]!
    .values.map(([name]) => String(name));
  const counts = Object.fromEntries(
    tables.map((name) => [
      name,
      Number(raw.exec(`SELECT count(*) FROM "${name}"`)[0]!.values[0]![0]),
    ]),
  );
  const bytes = raw.export();
  raw.close();
  return { bytes, counts };
}

test('a fresh profile runs onboarding, library, search and settings on the native host', async () => {
  const userDataDir = profile();
  const { app, page } = await launch(userDataDir);

  const services = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().map((metric) => metric.name ?? metric.serviceName ?? metric.type),
  );
  expect(services).toContain('MangaVerse data host');

  await finishOnboarding(page);
  await expect(page.locator('[data-app-shell="true"]')).toBeVisible();
  expect(appSetting<{ status: string }>(userDataDir, 'onboarding')?.status).toBe('completed');

  // The journal mode is a property of the file: WAL means the host opened it.
  const [mode] = query<{ journal_mode: string }>(userDataDir, 'PRAGMA journal_mode');
  expect(mode?.journal_mode).toBe('wal');

  // Search records its query through the host.
  await page.goto('app://app/search');
  await page.getByRole('searchbox', { name: 'Search manga' }).fill('berserk');
  await expect
    .poll(() => query<{ query: string }>(userDataDir, 'SELECT query FROM search_history'))
    .toEqual([{ query: 'berserk' }]);

  // A settings write lands in the native file.
  await page.goto('app://app/settings/app');
  const lowMemory = page.getByRole('switch', { name: 'Low-memory mode' });
  await expect(lowMemory).toBeVisible({ timeout: 20_000 });
  await lowMemory.click();
  await expect
    .poll(() => appSetting<{ lowMemoryMode: boolean }>(userDataDir, 'global')?.lowMemoryMode)
    .toBe(true);

  // The renderer never opened sql.js: it never wrote a snapshot.
  expect(await snapshotDigest(page)).toBeNull();
  test.info().annotations.push({ type: 'services', description: services.join(', ') });
});

test('a first start with a sql.js snapshot imports it once, verified, and keeps the snapshot', async () => {
  const userDataDir = profile();
  const { bytes, counts } = await rendererSnapshot();

  // Leave a renderer snapshot in the profile, then remove the native file a first start made,
  // which is what a profile from before the data host looks like.
  const seeded = await launch(userDataDir);
  await writeSnapshot(seeded.page, bytes);
  const before = await snapshotDigest(seeded.page);
  expect(before).toBe(createHash('sha256').update(bytes).digest('hex'));
  await seeded.app.close();
  for (const suffix of ['', '-wal', '-shm'])
    rmSync(join(userDataDir, `${DATABASE}${suffix}`), { force: true });

  const first = await launch(userDataDir);
  await first.page.goto('app://app/library');
  // Onboarding was completed in the snapshot, so the imported library shows at once.
  await expect(first.page).toHaveURL('app://app/library');
  await expect(first.page.getByText('Imported Alpha').first()).toBeVisible({ timeout: 20_000 });
  await expect(first.page.getByText('Imported Beta').first()).toBeVisible();

  const markerPath = join(userDataDir, `${DATABASE}.import.json`);
  const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
    tables: Record<string, number>;
    totalRows: number;
  };
  // The marker holds the verified counts at import time, for every table.
  expect(marker.tables).toEqual(counts);
  // The app writes on start (first-party providers), so the live file is checked on the library.
  for (const table of ['manga_identities', 'manga_provider_mappings', 'library_entries']) {
    const [native] = query<{ n: number }>(userDataDir, `SELECT count(*) AS n FROM "${table}"`);
    expect(native?.n, table).toBe(counts[table]);
  }
  expect(await snapshotDigest(first.page)).toBe(before);
  test.info().annotations.push({
    type: 'import',
    description: `${marker.totalRows} rows: ${JSON.stringify(marker.tables)}`,
  });

  // A native write, then a restart: nothing is imported again and the write survives.
  await first.page.goto('app://app/search');
  await first.page.getByRole('searchbox', { name: 'Search manga' }).fill('after import');
  await expect
    .poll(() => query<{ query: string }>(userDataDir, 'SELECT query FROM search_history'))
    .toEqual([{ query: 'after import' }]);
  const markerText = readFileSync(markerPath, 'utf8');
  await first.app.close();

  const second = await launch(userDataDir);
  await second.page.goto('app://app/library');
  await expect(second.page.getByText('Imported Alpha').first()).toBeVisible({ timeout: 20_000 });
  expect(readFileSync(markerPath, 'utf8')).toBe(markerText);
  expect(query<{ query: string }>(userDataDir, 'SELECT query FROM search_history')).toEqual([
    { query: 'after import' },
  ]);
  expect(await snapshotDigest(second.page)).toBe(before);
});

test('a snapshot that fails verification stays in use and the failure is a typed error', async () => {
  const userDataDir = profile();
  // A dangling library row: sql.js never checked it, the import's foreign-key check refuses it.
  const { bytes } = await rendererSnapshot((raw) =>
    raw.exec(
      `PRAGMA foreign_keys = OFF;
       INSERT INTO library_entries (id, manga_id, favorite, status, unread_count)
       VALUES ('dangling', 'missing-manga', 0, 'reading', 0);`,
    ),
  );
  const seeded = await launch(userDataDir);
  await writeSnapshot(seeded.page, bytes);
  await seeded.app.close();
  for (const suffix of ['', '-wal', '-shm'])
    rmSync(join(userDataDir, `${DATABASE}${suffix}`), { force: true });

  const { page } = await launch(userDataDir);
  const failure = page.waitForEvent('console', {
    predicate: (message) => message.text().includes('data-host.import_failed'),
    timeout: 20_000,
  });
  await page.reload();
  expect((await failure).type()).toBe('error');
  expect(existsSync(join(userDataDir, DATABASE))).toBe(false);
  // The window keeps working on the old path, with the snapshot's library.
  await page.goto('app://app/library');
  await expect(page).toHaveURL('app://app/library');
  await expect(page.getByText('Imported Alpha').first()).toBeVisible({ timeout: 20_000 });
});
