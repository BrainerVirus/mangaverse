import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  fixturesDir,
  currentPing,
  MANGADEX_APP_MANGA_ID,
  test,
  TINY_JPEG,
  waitForNewPing,
  waitForPingQuiet,
} from './helpers.js';

test.describe.configure({ timeout: 120_000 });

async function openReader(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: /Ch\. 1 - The Summoner/ }).click();
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

async function settings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  return page.getByRole('dialog', { name: 'Reader settings' });
}

async function blurControl(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

test('saved low-memory/preload, background, and always-visible chrome apply to the reader', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  await page.goto('/settings/reader');
  const preload = page.getByRole('slider', { name: 'Preload ahead', exact: true });
  const firstPing = await currentPing(page);
  await preload.focus();
  await page.keyboard.press('Home');
  // One durable write at a time: concurrent saves can otherwise land out of order.
  await waitForNewPing(page, firstPing);
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('switch', { name: 'Low-memory mode', exact: true }).click();
  await page.getByRole('combobox', { name: 'Reader chrome', exact: true }).click();
  await page.getByRole('option', { name: 'Always visible', exact: true }).click();
  await page.getByLabel('Background color', { exact: true }).fill('#123456');
  // Colour input commits on blur; moving focus also flushes the burst.
  await preload.focus();
  await waitForPingQuiet(page);

  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('.mangadex.network/')) requests += 1;
  });

  await openReader(page);
  await expect(page.getByTestId('reader-surface').locator('img')).toBeVisible();
  await expect(page.getByTestId('reader-surface')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await expect(page.locator('[role="toolbar"]')).toHaveAttribute('aria-hidden', 'false');
  const toolbar = page.getByRole('toolbar', { name: 'Reader controls' });
  await expect(toolbar).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reader-saved-settings.png') });

  // The centre tap only toggles the stored chrome flag; 'always' keeps it up.
  const box = (await page.getByTestId('reader-surface').boundingBox())!;
  await page.mouse.click(box.width / 2, box.height / 2);
  await expect(toolbar).toBeVisible();

  // Low-memory mode with a zero preload budget fetches only the visible page.
  await waitForPingQuiet(page);
  expect(requests).toBe(1);

  await blurControl(page);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`/manga/${MANGADEX_APP_MANGA_ID}`));
});

test('RTL maps once, modal keys stay isolated, overrides reset, and hidden chrome keeps an exit', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  await openReader(page);
  const dialog = await settings(page);
  // Reader shortcuts must not fire through the open sheet (or its controls).
  await page.keyboard.press('End');
  await expect(page.getByText('1 / 37')).toBeVisible();
  await dialog.getByRole('button', { name: 'Right to left', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Right to left', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await blurControl(page);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('2 / 37')).toBeVisible();
  const box = (await page.getByTestId('reader-surface').boundingBox())!;
  // In RTL the leading (left) third turns the page forward, once.
  await page.mouse.click(box.width * 0.15, box.height * 0.5);
  await expect(page.getByText('3 / 37')).toBeVisible();

  await waitForPingQuiet(page);
  await page.reload();
  await expect(page.getByText('3 / 37')).toBeVisible({ timeout: 30_000 });
  const reopened = await settings(page);
  await expect(
    reopened.getByRole('button', { name: 'Right to left', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  await reopened.getByRole('button', { name: 'Reset title settings' }).click();
  await expect(
    reopened.getByRole('button', { name: 'Left to right', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('title-settings-reset.png') });

  await page.keyboard.press('Escape');
  await expect(reopened).toBeHidden();
  await blurControl(page);

  // Hidden chrome leaves no focusable controls behind, but the exit remains.
  const surface = (await page.getByTestId('reader-surface').boundingBox())!;
  await page.mouse.click(surface.width / 2, surface.height / 2);
  // aria-hidden removes the toolbar from the role tree; the DOM attribute stays.
  const toolbar = page.locator('[role="toolbar"]');
  await expect(toolbar).toHaveAttribute('inert');
  await page.screenshot({ path: testInfo.outputPath('hidden-chrome-exit.png') });
  await page.keyboard.press('Tab');
  const close = page.getByRole('button', { name: 'Close reader', exact: true });
  await expect(close).toBeFocused();
  await close.click();
  await expect(page).toHaveURL(new RegExp(`/manga/${MANGADEX_APP_MANGA_ID}`));
});

test('failed mounted pages have Retry/Skip/Back and recover without a remount', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  let failed = true;
  await page.route('**/*.mangadex.network/**', async (route) => {
    if (failed) await route.abort('failed');
    else await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });

  await openReader(page);
  const error = page.getByRole('alert').filter({ hasText: 'Could not load page 1' });
  await expect(error).toBeVisible();
  await expect(error.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(error.getByRole('button', { name: 'Skip page' })).toBeVisible();
  await expect(error.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('failed-page-actions.png') });

  // Back leaves the reader from the failure itself.
  await error.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/manga/${MANGADEX_APP_MANGA_ID}`));

  await page.getByRole('button', { name: /Ch\. 1 - The Summoner/ }).click();
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const failedPageOne = page.getByRole('alert').filter({ hasText: 'Could not load page 1' });
  await expect(failedPageOne).toBeVisible();
  await failedPageOne.getByRole('button', { name: 'Skip page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load page 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByText('1 / 37')).toBeVisible();

  failed = false;
  await page
    .getByRole('alert')
    .filter({ hasText: 'Could not load page 1' })
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(page.getByTestId('reader-surface').locator('img')).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId('reader-surface')
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
});

test('mobile chrome fits and chapter end offers a next chapter and a return path', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const feed = JSON.parse(readFileSync(`${fixturesDir}/feed.json`, 'utf8'));
  const next = structuredClone(feed.data[0]);
  next.id = '11111111-1111-4111-8111-111111111111';
  next.attributes.chapter = '2';
  next.attributes.title = 'The next chapter';
  feed.data = [feed.data[0], next];
  feed.total = 2;
  await page.route('**/manga/*/feed?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed) }),
  );

  await openReader(page);
  for (const name of ['Close reader', 'Settings', 'Maximize']) {
    const button = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(button.x).toBeGreaterThanOrEqual(0);
    expect(button.x + button.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-chrome.png') });

  await blurControl(page);
  await page.keyboard.press('End');
  await expect(page.getByText('37 / 37')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  const transition = page.getByRole('dialog');
  await expect(transition.getByRole('heading', { name: 'Chapter complete' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('chapter-transition.png') });
  await transition.getByRole('button', { name: 'Read next chapter' }).click();
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Ch\. 2 - The next chapter/)).toBeVisible();
  await waitForPingQuiet(page);

  await blurControl(page);
  await page.keyboard.press('End');
  await expect(page.getByText('37 / 37')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('You reached the last available chapter.');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Read next chapter' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to chapter' }).click();
  await expect(transition).toBeHidden();

  // The transition is also the previous-chapter path once a chapter is open.
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(transition.getByRole('heading', { name: 'Chapter complete' })).toBeVisible();
  await transition.getByRole('button', { name: 'Previous chapter' }).click();
  await expect(page.getByText('37 / 37')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Close reader', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/manga/${MANGADEX_APP_MANGA_ID}`));
});

test('fit width starts at the top, original scrolls, and landscape strips have only the configured gap', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  await page.route('**/*.mangadex.network/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="720"><rect width="1440" height="720" fill="white"/></svg>',
    });
  });
  await openReader(page);
  await expect(page.getByTestId('reader-surface').locator('img')).toBeVisible();

  const dialog = await settings(page);
  await dialog.getByRole('button', { name: 'Original size' }).click();
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.getByTestId('reader-page-box').evaluate((box) => box.getBoundingClientRect().width),
    )
    .toBe(1440);
  const zoom = page.getByTestId('reader-zoom-layer');
  expect(await zoom.evaluate((layer) => layer.scrollWidth >= layer.clientWidth)).toBe(true);
  expect((await page.getByTestId('reader-page-box').boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('original-fit-scrolls.png') });

  const again = await settings(page);
  await again.getByRole('button', { name: 'Fit width' }).click();
  await page.keyboard.press('Escape');
  expect((await page.getByTestId('reader-page-box').boundingBox())!.y).toBeGreaterThanOrEqual(0);

  await page.getByRole('button', { name: 'Scroll', exact: true }).click();
  const rows = page.getByTestId('reader-scroll-view').locator('[data-page-index]');
  await expect(rows.nth(1).locator('img')).toBeVisible();
  await expect
    .poll(async () => {
      const first = (await rows.nth(0).locator('img').boundingBox())!;
      const second = (await rows.nth(1).locator('img').boundingBox())!;
      return Math.round(second.y - first.y - first.height);
    })
    .toBe(8);
  // A 1440x720 page keeps its landscape ratio instead of a hardcoded 2:3 row.
  await expect
    .poll(() => rows.nth(0).evaluate((row) => (row as HTMLElement).style.aspectRatio))
    .toBe('1440 / 720');
  await page.screenshot({ path: testInfo.outputPath('landscape-strip.png') });
});
