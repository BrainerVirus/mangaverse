import { expect, type Page } from '@playwright/test';
import { grayscalePng, MANGADEX_APP_MANGA_ID, reloadDurable, test } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
const STRIP_WIDTH = 800;
const STRIP_HEIGHT = 6000;

/** Records, per document, whether the paged layer was ever attached. */
async function watchPagedLayer(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sawPagedLayer?: boolean };
    w.__sawPagedLayer = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="reader-zoom-layer"]') !== null) {
        w.__sawPagedLayer = true;
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

const sawPagedLayer = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sawPagedLayer?: boolean }).__sawPagedLayer);

test('Given a long strip with no stored shapes and Auto mode, When the first page decodes, Then the reader switches to the strip, and a reload opens the strip from the stored shape', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  const tall = grayscalePng(STRIP_WIDTH, STRIP_HEIGHT);
  // Registered after the shared mock, so it answers the image CDN instead.
  await page.route('**/*.mangadex.network/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: tall }),
  );
  await watchPagedLayer(page);

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });

  // Nothing is known before the first decode, so the reader opens paged and
  // switches once the page reports its shape.
  const strip = page.getByTestId('reader-scroll-view');
  await expect(strip).toBeVisible({ timeout: 30_000 });
  expect(await sawPagedLayer(page)).toBe(true);
  await expect(page.getByText('1 / 37')).toBeVisible();

  // The stored shape resolves Auto before paint: the paged layer never mounts.
  await reloadDurable(page);
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('1 / 37')).toBeVisible();
  expect(await sawPagedLayer(page)).toBe(false);
});
