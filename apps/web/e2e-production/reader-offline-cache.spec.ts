import { expect, type Page } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, TINY_JPEG, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;

/**
 * Serves the image CDN but fails the named pages, so the chapter ends up only
 * partially cached: those pages never reach the page cache.
 */
async function failPages(page: Page, pageTokens: readonly string[]) {
  await page.route('**/*.mangadex.network/**', async (route) => {
    const url = route.request().url();
    if (pageTokens.some((token) => url.includes(`/x${token}-`))) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
}

async function openReader(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

test('Given a partially cached chapter, When reopened offline, Then the missing pages are named', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // The shared mock serves the image CDN; this route is registered after it and
  // fails only pages 3 and 5, so everything else caches normally.
  await failPages(page, ['3', '5']);

  await openReader(page);
  // The reader prefetches the whole chapter; a quiet window covers the bounded
  // fetches so the cache state below is settled.
  await waitForPingQuiet(page);

  // Leave the reader, then cut every provider host before returning offline.
  await page.goBack();
  await page.context().setOffline(true);
  await page.route('**/api.mangadex.org/**', (route) => route.abort('failed'));
  await page.route('**/*.mangadex.network/**', (route) => route.abort('failed'));

  await page.goForward();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // The cached pages still render from the page cache.
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), {
      timeout: 20_000,
    })
    .toBe(true);

  // The two pages that never cached are named instead of being silently blank.
  const note = page.getByTestId('reader-offline-note');
  await expect(note).toBeVisible({ timeout: 20_000 });
  await expect(note).toHaveText('Offline: pages 3 and 5 are not saved locally.');

  await page.context().setOffline(false);
});
