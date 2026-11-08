import { expect } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';
import { holdLocalDatabase } from './loading-shift.js';

test.describe.configure({ timeout: 90_000 });
test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Given a title that is still loading, When it arrives, Then Back and the header actions do not move', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  const gate = await holdLocalDatabase(page);
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const back = page.getByRole('button', { name: 'Back' });
  await expect(back).toBeVisible({ timeout: 40_000 });
  // The route eases in for a few hundred ms (a transform, not layout): measure once it rests.
  await page.waitForTimeout(800);
  const header = page.locator('[data-detail-header] [data-page-header]');
  const before = {
    back: await back.boundingBox(),
    action: await header.locator('.h-10').first().boundingBox(),
  };

  gate.release();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 40_000 });
  const after = {
    back: await back.boundingBox(),
    action: await page.getByRole('button', { name: 'Start reading' }).boundingBox(),
  };

  // The placeholder is the loaded layout's own boxes: a few pixels of text metrics at most.
  expect(Math.abs(after.back!.y - before.back!.y)).toBeLessThan(1);
  expect(Math.abs(after.back!.x - before.back!.x)).toBeLessThan(1);
  expect(Math.abs(after.action!.y - before.action!.y)).toBeLessThan(2);
  expect(Math.abs(after.action!.x - before.action!.x)).toBeLessThan(4);
});
