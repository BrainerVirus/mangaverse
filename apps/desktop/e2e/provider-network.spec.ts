import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

// #211 on the production build: provider HTTP runs in main under the manifest allowlist and
// the pinned-address transport. The renderer cannot reach a provider host at all, a private
// or redirected-to-private target is refused before any connection, and Discover, covers,
// chapter metadata and reader pages all arrive through main.

test.describe.configure({ timeout: 180_000 });

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const fixturesDir = join(desktopRoot, '../../packages/extensions/src/mangadex/fixtures');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const DATABASE = 'mangaverse.sqlite';
const MANGADEX_MANGA_ID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
const PAGE_COUNT = 37;
const PAGE_URL = /^page:\/\/store\/[0-9a-f]{64}$/;

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

interface FixtureServer {
  readonly origin: string;
  readonly requests: { readonly path: string; readonly host: string; readonly origin?: string }[];
  secretHits(): number;
  close(): Promise<void>;
}

const fixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf8');

async function startFixtureServer(): Promise<FixtureServer> {
  const atHome = JSON.parse(fixture('at-home.json')) as { baseUrl: string };
  const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
  const requests: { path: string; host: string; origin?: string }[] = [];
  let secretHits = 0;
  let port = 0;
  let redirectTarget = '';

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.local');
    requests.push({
      path: url.pathname,
      host: request.headers.host ?? '',
      ...(request.headers.origin !== undefined ? { origin: request.headers.origin } : {}),
    });
    if (url.pathname === '/secret') {
      secretHits += 1;
      response.writeHead(200).end('secret');
      return;
    }
    if (url.pathname === '/redirect-to-local') {
      response.writeHead(302, { location: redirectTarget }).end();
      return;
    }
    if (url.pathname.startsWith('/covers/') || url.pathname.startsWith('/data')) {
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
  port = address.port;
  redirectTarget = `http://127.0.0.1:${port}/secret`;

  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    secretHits: () => secretHits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const cleanups: (() => void)[] = [];

test.afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function seededProfile(): Promise<{ userDataDir: string; mangaId: string }> {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-network-'));
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
  cleanups.unshift(() => void app.close().catch(() => undefined));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function providerRequest(page: Page, url: string): Promise<{ ok: boolean; code?: string }> {
  return page.evaluate(async (target) => {
    const bridge = (
      globalThis as unknown as {
        mangaversePlatform: {
          providerNetworkRequest: (input: {
            providerId: string;
            url: string;
          }) => Promise<{ ok: boolean; error?: { code?: string } }>;
        };
      }
    ).mangaversePlatform;
    const result = await bridge.providerNetworkRequest({ providerId: 'mangadex', url: target });
    return {
      ok: result.ok,
      ...(result.error?.code !== undefined ? { code: result.error.code } : {}),
    };
  }, url);
}

test('Given provider traffic, When it leaves the renderer, Then main enforces the allowlist and SSRF rules and the reader still works', async () => {
  const fixtureServer = await startFixtureServer();
  cleanups.unshift(() => void fixtureServer.close());
  const { userDataDir, mangaId } = await seededProfile();
  const { page } = await launch(userDataDir, fixtureServer.origin);
  const errors = watchErrors(page);

  // Discover: the recorded search response comes back through main.
  await page.goto('app://app/discover');
  await expect(page.getByText('Kuro no Shoukanshi').first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => fixtureServer.requests.some((request) => request.path.startsWith('/covers/')))
    .toBe(true);
  await expect
    .poll(
      async () =>
        page
          .locator('img[data-cover-url]')
          .first()
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      { timeout: 20_000 },
    )
    .toBe(true);

  // Detail and reader: the same manga's cover, chapters and pages all come from main.
  await page.goto(`app://app/manga/${mangaId}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText(`1 / ${PAGE_COUNT}`)).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect
    .poll(
      async () => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      {
        timeout: 20_000,
      },
    )
    .toBe(true);
  expect(await image.getAttribute('src')).toMatch(PAGE_URL);
  // The at-home baseUrl is the dynamic *.mangadex.network host; main reached it
  // only because the manifest declared the wildcard.
  expect(fixtureServer.requests.some((request) => request.path.startsWith('/data'))).toBe(true);
  // The renderer never made a provider request itself; every one came from main.
  expect(fixtureServer.requests.every((request) => request.origin === undefined)).toBe(true);

  // A private target is refused before any connection.
  const beforeLocalHits = fixtureServer.requests.filter(
    (request) => request.path === '/secret',
  ).length;
  const local = await providerRequest(
    page,
    `http://127.0.0.1:${new URL(fixtureServer.origin).port}/secret`,
  );
  expect(local).toEqual({ ok: false, code: 'platform.invalid-url' });
  expect(fixtureServer.requests.filter((request) => request.path === '/secret')).toHaveLength(
    beforeLocalHits,
  );

  // A redirect to a private address is refused before that hop, not followed.
  const redirected = await providerRequest(page, 'https://api.mangadex.org/redirect-to-local');
  expect(redirected.ok).toBe(false);
  expect(fixtureServer.secretHits()).toBe(0);

  // The renderer itself cannot reach a provider host: production CSP has no remote connect-src.
  const direct = await page.evaluate(async () => {
    try {
      await fetch('https://api.mangadex.org/manga');
      return 'allowed';
    } catch {
      return 'blocked';
    }
  });
  expect(direct).toBe('blocked');

  expect(
    errors.filter((text) => !/Refused to connect|Content Security Policy/i.test(text)),
  ).toEqual([]);
});
