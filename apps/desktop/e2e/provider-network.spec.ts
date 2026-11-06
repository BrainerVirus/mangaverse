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
// Reader pages ask main for the Auto display copy (display downscale, spec 07).
const PAGE_URL = /^page:\/\/store\/[0-9a-f]{64}\?display=2048$/;

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

interface FixtureServer {
  readonly origin: string;
  readonly requests: {
    readonly path: string;
    readonly host: string;
    readonly origin?: string;
    readonly at: number;
  }[];
  /** Status the fixture returned for each `/manga` search request, in order. */
  readonly searchStatuses: number[];
  /** Arrival timestamps for each `/manga` search request, in order. */
  searchTimes(): number[];
  secretHits(): number;
  close(): Promise<void>;
}

interface FixtureServerOptions {
  /** Answer the first `/manga` search with 429 + `Retry-After: 2`, then 200. */
  readonly rateLimitFirstSearch?: boolean;
}

const fixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf8');

const PROVIDER_MANIFEST = {
  id: 'mangadex',
  name: 'MangaDex (preview fixture)',
  version: '0.1.1',
  description: 'Manifest served by the provider-network E2E fixture.',
  source: { url: 'https://mangadex.org', publisher: 'MangaDex' },
  compatibility: { platforms: ['web', 'desktop'] },
  network: {
    domains: ['api.mangadex.org', 'uploads.mangadex.org', '*.mangadex.network'],
  },
  capabilities: { 'discovery.search': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: true, suggestive: true, violence: true },
} as const;

async function startFixtureServer(options: FixtureServerOptions = {}): Promise<FixtureServer> {
  const atHome = JSON.parse(fixture('at-home.json')) as { baseUrl: string };
  const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
  const requests: {
    path: string;
    host: string;
    origin?: string;
    at: number;
  }[] = [];
  const searchStatuses: number[] = [];
  let secretHits = 0;
  let port = 0;
  let redirectTarget = '';
  let searchAttempts = 0;

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.local');
    requests.push({
      path: url.pathname,
      host: request.headers.host ?? '',
      ...(request.headers.origin !== undefined ? { origin: request.headers.origin } : {}),
      at: Date.now(),
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
    if (url.pathname === '/provider-manifest.json') {
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(PROVIDER_MANIFEST));
      return;
    }
    if (url.pathname.startsWith('/covers/') || url.pathname.startsWith('/data')) {
      response.writeHead(200, { 'content-type': 'image/jpeg' }).end(jpeg);
      return;
    }
    const isSearch = url.pathname === '/manga';
    if (isSearch && options.rateLimitFirstSearch === true && searchAttempts === 0) {
      searchAttempts += 1;
      searchStatuses.push(429);
      response
        .writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' })
        .end(JSON.stringify({ result: 'error', errors: [{ status: 429, title: 'rate limited' }] }));
      return;
    }
    if (isSearch) {
      searchAttempts += 1;
      searchStatuses.push(200);
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
    searchStatuses,
    searchTimes: () =>
      requests.filter((request) => request.path === '/manga').map((request) => request.at),
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
  const readerSrc = await image.getAttribute('src');
  expect(readerSrc).toMatch(PAGE_URL);
  // The at-home baseUrl is the dynamic *.mangadex.network host; main reached it
  // only because the manifest declared the wildcard.
  expect(fixtureServer.requests.some((request) => request.path.startsWith('/data'))).toBe(true);
  // The renderer never made a provider request itself; every one came from main.
  expect(fixtureServer.requests.every((request) => request.origin === undefined)).toBe(true);

  // Install preview: the manifest's declared network domains are shown before any
  // install is confirmed. Main fetches the manifest through the same transport.
  await page.goto('app://app/extensions');
  await page.getByRole('button', { name: 'Install provider' }).first().click();
  await page.getByLabel('Manifest URL').fill('https://api.mangadex.org/provider-manifest.json');
  await page.getByRole('button', { name: 'Review manifest' }).click();
  await expect(page.getByText('Network domains')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('api.mangadex.org', { exact: true })).toBeVisible();
  await expect(page.getByText('*.mangadex.network', { exact: true })).toBeVisible();
  process.stdout.write('[provider-network] install preview rendered MangaDex domains\n');

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
  process.stdout.write(
    `[provider-network] requests=${fixtureServer.requests.length} readerPageSrc=${String(
      readerSrc,
    )} directFetch=${direct}\n`,
  );

  expect(
    errors.filter((text) => !/Refused to connect|Content Security Policy/i.test(text)),
  ).toEqual([]);
});

test('Given a 429 with Retry-After, When two searches run, Then the second waits for the window and the app stays usable', async () => {
  const fixtureServer = await startFixtureServer({ rateLimitFirstSearch: true });
  cleanups.unshift(() => void fixtureServer.close());
  const { userDataDir } = await seededProfile();
  const { page } = await launch(userDataDir, fixtureServer.origin);

  await page.goto('app://app/search');
  const input = page.getByTestId('search-input');
  await expect(input).toBeVisible({ timeout: 30_000 });

  // First search: the fixture answers 429 with Retry-After: 2, and the search
  // query does not retry a rate-limit failure, so it reaches the UI.
  await input.fill('berserk');
  await expect(page.getByText(/provider search failed/i)).toBeVisible({ timeout: 30_000 });
  expect(fixtureServer.searchStatuses[0]).toBe(429);

  // Second search while the gate is still blocked: acquire waits out the two
  // seconds, then the request lands and the recorded results render.
  await input.fill('one piece');
  await expect(page.getByText('Kuro no Shoukanshi').first()).toBeVisible({ timeout: 30_000 });

  const times = fixtureServer.searchTimes();
  expect(times.length).toBeGreaterThanOrEqual(2);
  // The gate waits Retry-After from when the 429's body was read, so the second
  // /manga request reaches the fixture at least ~2 s after the first. CI slop:
  // assert 1.9 s rather than exactly 2000 ms.
  const deltaMs = times[1]! - times[0]!;
  process.stdout.write(
    `[provider-network] rate-limited search: first=${times[0]!}ms second=${times[1]!}ms delta=${deltaMs}ms\n`,
  );
  expect(deltaMs).toBeGreaterThanOrEqual(1_900);
  expect(fixtureServer.searchStatuses[1]).toBe(200);

  // The app is still usable: the search field accepts another query.
  await expect(input).toBeEnabled();
  await input.fill('kuro');
  await expect(page.getByText('Kuro no Shoukanshi').first()).toBeVisible({ timeout: 30_000 });
});
