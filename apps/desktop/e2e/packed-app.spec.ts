import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';

// #215 live proof on the packaged macOS app: launch MangaVerse.app from release/ (not the
// dev build), then observe app:// deep routes, the data host and one-way renderer import,
// page:// pages, and no listening TCP port. Provider traffic is covered by the unpackaged
// E2E, which can seed a fixture; the packaged app must never honor that test seam.

test.describe.configure({ timeout: 240_000 });

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const DATABASE = 'mangaverse.sqlite';
const MARKER = `${DATABASE}.import-renderer.json`;
const TITLE = 'Packed Profile Title';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

const cleanups: (() => void | Promise<void>)[] = [];

test.afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

function asarHash(app: string): string {
  return createHash('sha256')
    .update(readFileSync(join(app, 'Contents/Resources/app.asar')))
    .digest('hex');
}

/**
 * The proof must run against the artifact this build produced, never a leftover directory.
 * Unpacks the current arch's zip into a fresh `release/packed-proof-current`, fails loudly
 * when there is no zip, and rejects a zip whose asar differs from the freshly built app.
 */
function unpackCurrentZip(): string | null {
  if (process.platform !== 'darwin') return null;
  const release = join(desktopRoot, 'release');
  const zipPattern = new RegExp(`^MangaVerse-.*-${process.arch}\\.zip$`);
  const zips = existsSync(release)
    ? readdirSync(release)
        .filter((name) => zipPattern.test(name))
        .sort()
    : [];
  const latest = zips.at(-1);
  if (latest === undefined) {
    throw new Error(
      'No packaged zip in apps/desktop/release. Run: pnpm --filter @app/desktop package:mac',
    );
  }
  const zip = join(release, latest);
  const directory = join(release, 'packed-proof-current');
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  execFileSync('unzip', ['-q', zip, '-d', directory]);
  const app = join(directory, 'MangaVerse.app');
  if (!existsSync(join(app, 'Contents/MacOS/MangaVerse'))) {
    throw new Error(`The built zip does not contain MangaVerse.app: ${zip}`);
  }
  const builtFolders = process.arch === 'arm64' ? ['mac-arm64'] : ['mac', 'mac-x64'];
  for (const folder of builtFolders) {
    const built = join(release, folder, 'MangaVerse.app');
    if (!existsSync(built)) continue;
    if (asarHash(built) !== asarHash(app)) {
      throw new Error(
        `The packaged zip is stale: ${zip} does not match release/${folder}. Repackage before proving.`,
      );
    }
  }
  return app;
}

// The fuse wire Electron embeds in its framework: this sentinel, a version byte, a length byte,
// then one ASCII byte per fuse ('1' on, '0' off). Index order is @electron/fuses' FuseV1Options.
const FUSE_SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
const FUSES = {
  runAsNode: 0,
  enableNodeOptionsEnvironmentVariable: 2,
  enableNodeCliInspectArguments: 3,
  enableEmbeddedAsarIntegrityValidation: 4,
  onlyLoadAppFromAsar: 5,
} as const;
const FRAMEWORK = 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework';

function fuseWire(binary: Buffer): { offset: number; length: number } {
  const at = binary.indexOf(FUSE_SENTINEL);
  if (at < 0 || binary.indexOf(FUSE_SENTINEL, at + 1) >= 0) {
    throw new Error('Expected exactly one Electron fuse wire in the framework');
  }
  const offset = at + FUSE_SENTINEL.length + 2;
  return { offset, length: binary[offset - 1]! };
}

function readFuses(app: string): Record<keyof typeof FUSES, boolean> {
  const binary = readFileSync(join(app, FRAMEWORK));
  const { offset } = fuseWire(binary);
  const entries = Object.entries(FUSES).map(([name, index]) => [
    name,
    binary[offset + index] === '1'.charCodeAt(0),
  ]);
  return Object.fromEntries(entries) as Record<keyof typeof FUSES, boolean>;
}

/**
 * The shipped app turns `enableNodeCliInspectArguments` off, and Electron then also ignores
 * `--remote-debugging-port`, which is how this proof drives the renderer. So the CDP-driven
 * tests run a throwaway copy of the packaged app with only that one fuse switched back on
 * (and re-signed ad hoc, which Apple Silicon needs after any edit). Every other byte, the asar
 * and the preload are the shipped ones; a separate test pins the shipped fuses.
 */
function debugCopy(shipped: string): string {
  const directory = join(desktopRoot, 'release/packed-proof-debug');
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const app = join(directory, 'MangaVerse.app');
  cpSync(shipped, app, { recursive: true, verbatimSymlinks: true });
  const frameworkPath = join(app, FRAMEWORK);
  const binary = readFileSync(frameworkPath);
  const { offset } = fuseWire(binary);
  binary[offset + FUSES.enableNodeCliInspectArguments] = '1'.charCodeAt(0);
  writeFileSync(frameworkPath, binary);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' });
  return app;
}

// Resolved on first use, so `--list` and the other specs never unpack an artifact.
let packedAppPath: string | null | undefined;
let debugAppPath: string | undefined;
test.skip(() => process.platform !== 'darwin', 'macOS only');

test.beforeAll(() => {
  packedAppPath = unpackCurrentZip();
  if (packedAppPath !== null) debugAppPath = debugCopy(packedAppPath);
});

function packagedApp(): string {
  if (packedAppPath === null) throw new Error('No packaged app to launch.');
  return packedAppPath;
}

function profile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-packed-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

interface PackedApp {
  readonly page: Page;
  readonly logs: string[];
  close(): Promise<void>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

/**
 * A packaged Electron app ignores Playwright's `_electron` loader injection (it is a
 * packaged main, not `electron .`), so drive the real app over its own DevTools endpoint.
 * Attaching to the renderer is enough: the preload bridge is the app's whole backend surface.
 */
async function launchPackaged(userDataDir: string): Promise<PackedApp> {
  const bundle = debugAppPath;
  if (bundle === undefined) throw new Error('No packaged app');
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  delete env.MANGAVERSE_RENDERER_URL;
  // The packaged app must ignore the unpackaged E2E's provider fixture seam even if a
  // shell inherited it from a test run.
  delete env.MANGAVERSE_E2E_PROVIDER_FIXTURE;
  const port = await freePort();
  const logs: string[] = [];
  let closed = false;
  const child = spawn(
    join(bundle, 'Contents/MacOS/MangaVerse'),
    [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`],
    { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  child.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));

  let browser: Browser | null = null;
  for (let attempt = 0; attempt < 120 && browser === null; attempt += 1) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await delay(250);
    }
  }
  if (browser === null) {
    child.kill('SIGKILL');
    throw new Error('The packaged app never opened its DevTools endpoint');
  }

  const browserRef = browser;
  const context = browserRef.contexts()[0] ?? (await browserRef.newContext());
  await context.setOffline(true);
  const page = context.pages()[0] ?? (await context.waitForEvent('page', { timeout: 30_000 }));
  await page.waitForLoadState('domcontentloaded');

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const close = async () => {
    if (closed) return;
    closed = true;
    await browserRef.close().catch(() => undefined);
    const pid = child.pid;
    if (pid === undefined) return;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
    await Promise.race([exited, delay(5_000)]);
    if (child.exitCode === null) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
      await Promise.race([exited, delay(2_000)]);
    }
  };
  cleanups.unshift(close);
  return { page, logs, close };
}

interface PackedBridge {
  pageStorePut(
    key: string,
    data: ArrayBuffer,
    mimeType: string,
  ): Promise<{ ok: boolean; value?: string }>;
  rendererImportState(): Promise<{
    ok: boolean;
    value?: { completed: boolean; database?: unknown };
  }>;
}

/** The sql.js snapshot a pre-data-host profile left in IndexedDB. */
async function oldSnapshot(): Promise<{ bytes: Uint8Array; mangaId: string }> {
  const require = createRequire(join(dbPackageRoot, 'package.json'));
  const initSqlJs = require('sql.js') as (options?: object) => Promise<{
    Database: new () => { export(): Uint8Array; close(): void };
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
    canonicalTitle: TITLE,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: 'mangadex',
    providerMangaId: 'packed-title',
  });
  if (!identity.ok) throw new Error(identity.error.message);
  await db.addLibraryEntry(drizzle, { mangaId: identity.value.mangaId, status: 'reading' });
  const now = new Date().toISOString();
  await db.upsertAppSetting(drizzle, 'onboarding', {
    status: 'completed',
    currentStep: 'provider',
    completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
    startedAt: now,
    completedAt: now,
  });

  const bytes = raw.export();
  raw.close();
  return { bytes, mangaId: identity.value.mangaId };
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

/** A profile with a legacy IndexedDB snapshot ready for the one-way import. */
async function seedLegacyProfile(): Promise<string> {
  const userDataDir = profile();
  const seeded = await launchPackaged(userDataDir);
  const snapshot = await oldSnapshot();
  await writeSnapshot(seeded.page, snapshot.bytes);
  await seeded.close();
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(join(userDataDir, `${DATABASE}${suffix}`), { force: true });
  }
  rmSync(join(userDataDir, MARKER), { force: true });
  return userDataDir;
}

test('the packaged app loads app://, imports legacy data and serves page://', async () => {
  const userDataDir = await seedLegacyProfile();
  const { page, logs } = await launchPackaged(userDataDir);

  // The one-way import runs while the window boots; wait for its verified marker before
  // navigating, so the router never sees the half-imported profile.
  await expect.poll(() => existsSync(join(userDataDir, MARKER)), { timeout: 60_000 }).toBe(true);

  // v0.0.1 ships with auto-update off: electron-builder.yml has no `publish` feed, so the
  // build carries no app-update.yml and main's own record says the updater is disabled.
  expect(existsSync(join(packagedApp(), 'Contents/Resources/app-update.yml'))).toBe(false);
  expect(logs.join('')).toContain('[updater] disabled');

  // app:// deep route, offline, after the renderer-data import moved the title into the
  // native database through the data host.
  const deep = await page.goto('app://app/library');
  expect(deep?.status()).toBe(200);
  await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 40_000 });
  await page.goto('app://app/settings');
  await expect(page.locator('[data-app-shell="true"]')).toBeVisible({ timeout: 20_000 });

  // The one-way import ran once and recorded its verified report next to the database.
  expect(existsSync(join(userDataDir, MARKER)), 'import marker').toBe(true);
  const importState = await page.evaluate(() =>
    (window as unknown as { mangaversePlatform: PackedBridge }).mangaversePlatform
      .rendererImportState()
      .then((r) => r.value),
  );
  expect(importState?.completed, 'import completed').toBe(true);

  // page:// serves a stored page to the app frame.
  const stored = await page.evaluate(
    (bytes) =>
      (window as unknown as { mangaversePlatform: PackedBridge }).mangaversePlatform.pageStorePut(
        'page:packed:e2e:0',
        Uint8Array.from(bytes).buffer,
        'image/jpeg',
      ),
    [...TINY_JPEG],
  );
  expect(stored.ok, 'page store put').toBe(true);
  expect(stored.value).toMatch(/^page:\/\/store\/[0-9a-f]{64}$/);
  const rendered = await page.evaluate(async (src) => {
    const image = new Image();
    const loaded = new Promise<number>((resolve, reject) => {
      image.onload = () => resolve(image.naturalWidth);
      image.onerror = () => reject(new Error('page image failed'));
    });
    image.src = src!;
    document.body.append(image);
    return loaded;
  }, stored.value);
  expect(rendered).toBeGreaterThan(0);
});

test('the shipped app flips the hardening fuses and ignores --remote-debugging-port', async () => {
  const bundle = packagedApp();
  expect(readFuses(bundle)).toEqual({
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  });

  const port = await freePort();
  const child = spawn(
    join(bundle, 'Contents/MacOS/MangaVerse'),
    [`--remote-debugging-port=${port}`, `--user-data-dir=${profile()}`],
    { stdio: 'ignore' },
  );
  try {
    await delay(8_000);
    const reachable = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2_000),
    }).then(
      () => true,
      () => false,
    );
    expect(reachable, 'the shipped app opened a DevTools endpoint').toBe(false);
  } finally {
    child.kill();
    await delay(500);
  }
});

test('a plain packaged launch opens no listening TCP port', async () => {
  const bundle = packagedApp();
  if (bundle === null) throw new Error('No packaged app');
  const plainProfile = profile();
  const child = spawn(
    join(bundle, 'Contents/MacOS/MangaVerse'),
    [`--user-data-dir=${plainProfile}`],
    {
      stdio: 'ignore',
    },
  );
  try {
    const samples: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      samples.push(listeningSockets(processTree(child.pid!)));
    }
    expect(samples.filter((sample) => sample !== '')).toEqual([]);
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
});

function processTree(rootPid: number): number[] {
  const parents = new Map<number, number[]>();
  for (const line of execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).split(
    '\n',
  )) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid !== undefined && pid > 0) parents.set(ppid!, [...(parents.get(ppid!) ?? []), pid]);
  }
  const pids = [rootPid];
  for (let i = 0; i < pids.length; i += 1) pids.push(...(parents.get(pids[i]!) ?? []));
  return pids;
}

function listeningSockets(pids: number[]): string {
  try {
    return execFileSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(',')], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    const { status, stdout } = error as { status?: number; stdout?: string };
    if (status === 1) return (stdout ?? '').trim();
    throw error;
  }
}
