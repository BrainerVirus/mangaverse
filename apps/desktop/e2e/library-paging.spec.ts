import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

// The library page's paged read on the production build (#220): the first paint carries a
// bounded page of a 250-title library, the count is the filter's total, and the rest arrives
// when asked for. Filtering and sorting start a new view at its first page.

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const DATABASE = 'mangaverse.sqlite';
const TITLES = 250;
const FIRST_PAGE = 200;

const cleanups: (() => void)[] = [];

test.afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const title = (index: number) => `Paging ${String(index).padStart(4, '0')}`;

/** A profile whose native database already holds 250 titles and a finished onboarding. */
async function seededProfile(): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-paging-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const host = await import(pathToFileURL(join(dbPackageRoot, 'dist/host/index.js')).href);
  const native = host.openNativeDatabase(join(directory, DATABASE));
  const database = native.client.database;

  const identity = database.prepare(
    'INSERT INTO manga_identities (id, canonical_title, status, content_rating, merged, default_provider_mapping_id) VALUES (?,?,?,?,?,?)',
  );
  const mapping = database.prepare(
    'INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id) VALUES (?,?,?,?)',
  );
  const entry = database.prepare(
    'INSERT INTO library_entries (id, manga_id, favorite, status, unread_count, added_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  );
  database.exec('BEGIN');
  for (let index = 0; index < TITLES; index += 1) {
    const suffix = String(index).padStart(4, '0');
    // Added oldest first, so the default date-added sort opens on the newest title.
    const addedAt = `2026-01-01T00:00:${suffix}.000Z`;
    identity.run(`manga-${suffix}`, title(index), 'ongoing', 'safe', 0, `mapping-${suffix}`);
    mapping.run(`mapping-${suffix}`, `manga-${suffix}`, 'mangadex', `remote-${index}`);
    entry.run(
      `entry-${suffix}`,
      `manga-${suffix}`,
      index % 5 === 0 ? 1 : 0,
      'reading',
      0,
      addedAt,
      addedAt,
    );
  }
  database.exec('COMMIT');

  const now = new Date().toISOString();
  database.prepare('INSERT INTO app_settings (key, value_json, updated_at) VALUES (?,?,?)').run(
    'onboarding',
    JSON.stringify({
      status: 'completed',
      currentStep: 'provider',
      completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
      startedAt: now,
      completedAt: now,
    }),
    now,
  );
  native.close();
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
  await app.evaluate(({ session }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  const page = await app.firstWindow();
  await page.goto('app://app/library');
  await expect(page.getByText(title(TITLES - 1)).first()).toBeVisible({ timeout: 20_000 });
  return { app, page };
}

/** Scrolls the library's own scroll container to its end and waits for the virtual rows. */
async function scrollLibraryToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    let node: HTMLElement | null = document.querySelector('[aria-label="Library titles"]');
    while (node !== null && node.scrollHeight <= node.clientHeight) node = node.parentElement;
    if (node !== null) node.scrollTop = node.scrollHeight;
    else if (document.scrollingElement !== null) {
      document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
}

test('Given 250 titles, When the library opens, Then one bounded page loads and more arrive on request', async () => {
  const directory = await seededProfile();
  const { page } = await launch(directory);

  const paginator = page.locator('[data-library-paginator]');
  // The count is the filter's total; the page is bounded to the first 200 rows.
  await expect(page.getByText(`${TITLES} titles`).first()).toBeVisible();
  await expect(paginator).toContainText(`Showing ${FIRST_PAGE} of ${TITLES} titles`);

  await page.getByRole('button', { name: 'Load more titles' }).click();
  // Every title is loaded now: the control leaves, and the oldest title is reachable.
  await expect(paginator).toHaveCount(0);
  await scrollLibraryToEnd(page);
  await expect(page.getByText(title(0)).first()).toBeVisible({ timeout: 10_000 });
});

test('Given the full library, When filtering, Then the total and page come from the filter', async () => {
  const directory = await seededProfile();
  const { page } = await launch(directory);

  // "Paging 004" matches the ten titles 0040-0049: one page, so no load-more control.
  await page.getByLabel('Search library').fill('Paging 004');
  await expect(page.getByText('10 titles').first()).toBeVisible();
  await expect(page.locator('[data-library-paginator]')).toHaveCount(0);
  await expect(page.getByText(title(40)).first()).toBeVisible();
});

test('Given the full library, When sorting by title, Then the first page starts at A', async () => {
  const directory = await seededProfile();
  const { page } = await launch(directory);

  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Sort library').click();
  await page.getByRole('option', { name: 'Title · A–Z' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Filters' })).toHaveCount(0);
  await expect(page.getByText(title(0)).first()).toBeVisible();
  // A new sort is a new view: it starts again at the first page, not the loaded page.
  await expect(page.locator('[data-library-paginator]')).toContainText(
    `Showing ${FIRST_PAGE} of ${TITLES} titles`,
  );
});
