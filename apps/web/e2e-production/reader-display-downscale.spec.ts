import { expect, type Page } from '@playwright/test';
import { grayscalePng, MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
const LARGE_WIDTH = 2400;
const LARGE_HEIGHT = 3600;

async function openFirstPage(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  return image.evaluate((node: HTMLImageElement) => ({
    width: node.naturalWidth,
    height: node.naturalHeight,
  }));
}

test('Given a 2400x3600 page, When display downscale is Auto then Off, Then the page shows at a 2048 long edge and then from the untouched stored original', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  const large = grayscalePng(LARGE_WIDTH, LARGE_HEIGHT);
  // Registered after the shared mock, so it answers the image CDN instead.
  await page.route('**/*.mangadex.network/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: large }),
  );

  // Auto is the default: the reader shows a smaller copy, aspect ratio kept.
  const auto = await openFirstPage(page);
  expect(Math.max(auto.width, auto.height)).toBe(2048);
  expect(auto.width).toBe(Math.round((LARGE_WIDTH * 2048) / LARGE_HEIGHT));

  await page.goto('/settings/reader');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('combobox', { name: 'Display downscale', exact: true }).click();
  await page.getByRole('option', { name: 'Off', exact: true }).click();
  await waitForPingQuiet(page);

  // Off, with the image CDN unreachable: the page can only come from the stored
  // blob, so its full size proves Auto never rewrote it.
  await page.unroute('**/*.mangadex.network/**');
  await page.route('**/*.mangadex.network/**', (route) => route.abort('failed'));
  const off = await openFirstPage(page);
  expect(off).toEqual({ width: LARGE_WIDTH, height: LARGE_HEIGHT });
});
