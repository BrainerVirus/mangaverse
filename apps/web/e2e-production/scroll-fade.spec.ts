import { expect } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });
// Short enough that the detail page overflows the main column, so it has edges to fade.
test.use({ viewport: { width: 1440, height: 520 } });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Given a long description, Then it folds behind a fade and Show more grows it to full height', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 40_000 });
  const box = page.locator('.expandable-box');
  const height = async () => Math.round((await box.boundingBox())!.height);

  await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible();
  expect(await height()).toBe(120);

  await page.getByRole('button', { name: 'Show more' }).click();
  await expect.poll(height).toBeGreaterThan(300);
  await page.getByRole('button', { name: 'Show less' }).click();
  await expect.poll(height).toBe(120);
});

test('Given the main column overflows, Then each edge fades only while content is hidden past it, beneath sticky chrome', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 40_000 });

  // The page column draws its fade as sticky overlays (::before is the top edge, ::after the
  // bottom one) whose opacity follows the scroll position.
  const fadesAt = async (position: 'top' | 'middle' | 'end') => {
    await page.evaluate((at) => {
      const main = document.querySelector('main')!;
      const max = main.scrollHeight - main.clientHeight;
      main.scrollTop = at === 'top' ? 0 : at === 'end' ? max : max / 2;
    }, position);
    await page.waitForTimeout(250);
    return page.evaluate(() => {
      const main = document.querySelector('main')!;
      return {
        top: parseFloat(getComputedStyle(main, '::before').opacity),
        bottom: parseFloat(getComputedStyle(main, '::after').opacity),
      };
    });
  };

  expect(await fadesAt('top')).toEqual({ top: 0, bottom: 1 });
  const middle = await fadesAt('middle');
  expect(middle.top).toBe(1);
  expect(middle.bottom).toBe(1);
  expect(await fadesAt('end')).toEqual({ top: 1, bottom: 0 });

  // Sticky chrome (the notices at z-40, the onboarding footer at z-10) stays above the fade.
  const layers = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    return {
      overlay: Number(getComputedStyle(main, '::before').zIndex),
      overlayBottom: Number(getComputedStyle(main, '::after').zIndex),
    };
  });
  expect(layers.overlay).toBe(1);
  expect(layers.overlayBottom).toBe(1);
});
