import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

import {
  MANGADEX_APP_MANGA_ID,
  currentPing,
  fixturesDir,
  test,
  waitForNewPing,
  waitForPingQuiet,
} from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;

async function openReader(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/, { timeout: 30_000 });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

/** Toggles the installed MangaDex provider from the Extensions page. */
async function setProviderEnabled(page: Page, enabled: boolean) {
  await page.goto('/extensions');
  const button = page.getByRole('button', { name: enabled ? 'Enable' : 'Disable' });
  await expect(button).toBeVisible({ timeout: 20_000 });
  await button.click();
  await expect(page.getByRole('button', { name: enabled ? 'Disable' : 'Enable' })).toBeVisible({
    timeout: 20_000,
  });
}

/** Blocks IndexedDB opens for the local snapshot store while the flag is set. */
function installLocalDbBlocker() {
  const open = indexedDB.open.bind(indexedDB);
  (window as unknown as { __blockLocalDb?: boolean }).__blockLocalDb = true;
  indexedDB.open = ((...args: Parameters<IDBFactory['open']>) => {
    if ((window as unknown as { __blockLocalDb?: boolean }).__blockLocalDb === true) {
      throw new Error('IndexedDB blocked for test');
    }
    return open(...args);
  }) as IDBFactory['open'];
}

test('Given an open chapter, When navigating by keyboard and buttons, Then pages change once each time', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 / 37')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('1 / 37')).toBeVisible();

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByText('1 / 37')).toBeVisible();
});

test('Given the chapter pages cannot be fetched, When retrying after the network returns, Then the chapter loads', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // Registered after the shared mock so it wins for the at-home route only.
  let failing = true;
  await page.route('**/api.mangadex.org/at-home/**', async (route) => {
    if (failing) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: readFileSync(fixturesDir + '/at-home.json', 'utf8'),
    });
  });

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('Could not load chapter')).toBeVisible({ timeout: 30_000 });

  failing = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
});

test('Given a cached chapter, When the network is gone and the reader is reopened, Then cached pages render', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await waitForPingQuiet(page);

  // Leave client-side, then cut every provider host before returning.
  await page.goBack();
  await page.context().setOffline(true);
  await page.route('**/api.mangadex.org/**', (route) => route.abort('failed'));
  await page.route('**/uploads.mangadex.org/**', (route) => route.abort('failed'));
  await page.route('**/*.mangadex.network/**', (route) => route.abort('failed'));

  await page.goForward();
  // Prove the environment, not just the assertions: the browser reports offline
  // and a provider-host fetch genuinely fails.
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(
    await page.evaluate(() =>
      fetch('https://api.mangadex.org/ping')
        .then(() => 'ok')
        .catch(() => 'failed'),
    ),
  ).toBe('failed');

  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), {
      timeout: 20_000,
    })
    .toBe(true);

  await page.context().setOffline(false);
});

test('Given the reader advanced a page, When the page reloads, Then it resumes on the saved page', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await waitForPingQuiet(page);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();
  // A full quiet window covers the 750 ms progress debounce plus the 400 ms
  // flush, so the reload below reads a snapshot that already holds page 2.
  await waitForPingQuiet(page);

  await page.reload();
  await expect(page.getByText('2 / 37')).toBeVisible({ timeout: 30_000 });
});

test('Given the provider cannot be resolved, When the reader opens a chapter with no local pages, Then it shows a retryable error instead of the empty state', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // Persist the chapter list first; disabling the provider must not blank the
  // locally available detail page. The reload below reads the committed
  // snapshot, so the write must be durable before navigating.
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await expect(page.getByRole('button', { name: CHAPTER_BUTTON })).toBeVisible({ timeout: 30_000 });
  await waitForPingQuiet(page);

  await setProviderEnabled(page, false);

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/, { timeout: 30_000 });

  // The chapter was never empty; it just has no pages yet and no provider to
  // fetch them from, so the reader must offer a retry, not 'No chapters'.
  await expect(page.getByText('Could not load chapter')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByText('No chapters available')).toHaveCount(0);

  // Re-enabling the provider and reopening the chapter recovers. The toggle
  // write must be durable before the reader reloads the snapshot.
  await setProviderEnabled(page, true);
  await waitForPingQuiet(page);
  await page.goBack();
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
});

test('Given the local database failed to open, When the reader retries, Then the query re-enables and the chapter loads', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // Persist the chapter list while the database is healthy, so recovery has
  // local data to read once the handle is rebuilt.
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await expect(page.getByRole('button', { name: CHAPTER_BUTTON })).toBeVisible({ timeout: 30_000 });
  await waitForPingQuiet(page);

  // The next document load fails local DB init (the in-page flag is cleared
  // below, so the retry inside the same load can open it again).
  await page.addInitScript(installLocalDbBlocker);

  await page.goto('/reader/dev-md-ch-c7649b69-6d7a-466c-a428-ab9b086ebe35');
  await expect(page.getByText('Could not load chapter')).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    (window as unknown as { __blockLocalDb?: boolean }).__blockLocalDb = false;
  });
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
});

test('Given a durable write fails, When the reader persists progress, Then it surfaces a retryable failure and recovers', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await waitForPingQuiet(page);

  // Only the local snapshot store is blocked, and only for this document.
  await page.evaluate(installLocalDbBlocker);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();

  await expect(page.getByText('Saving locally failed')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('IndexedDB blocked for test')).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __blockLocalDb?: boolean }).__blockLocalDb = false;
  });
  const pingBefore = await currentPing(page);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Saving locally failed')).toHaveCount(0, { timeout: 20_000 });
  // The retry wrote the pending snapshot: a new ping proves it is durable.
  await waitForNewPing(page, pingBefore);
});

test('Given the reader advanced a page, When leaving client-side immediately, Then the pending page is checkpointed', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await waitForPingQuiet(page);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();
  // Client-side back leaves the reader through the router, so React runs the
  // unmount checkpoint before the debounce would have fired.
  await page.goBack();
  await waitForPingQuiet(page);

  await page.goForward();
  await expect(page.getByText('2 / 37')).toBeVisible({ timeout: 30_000 });
});
