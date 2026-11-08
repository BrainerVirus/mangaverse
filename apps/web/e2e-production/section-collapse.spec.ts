import { expect } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

test('Given a collapsed settings section, When it opens and closes, Then its height eases instead of snapping', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const section = page.getByRole('region', { name: 'Possible duplicates' });
  await expect(section).toBeVisible({ timeout: 40_000 });
  await section.scrollIntoViewIfNeeded();
  const height = async () => Math.round((await section.boundingBox())!.height);
  const toggle = section.getByRole('button', { name: 'Possible duplicates' });
  const closed = await height();

  await toggle.click();
  // Sampled while the 300ms ease is travelling: strictly between the closed and open heights.
  await page.waitForTimeout(90);
  const mid = await height();
  await expect.poll(height, { timeout: 3_000 }).toBeGreaterThan(closed + 20);
  const open = await height();
  expect(mid).toBeGreaterThan(closed);
  expect(mid).toBeLessThan(open);

  await toggle.click();
  await page.waitForTimeout(90);
  const midClosing = await height();
  expect(midClosing).toBeGreaterThan(closed);
  expect(midClosing).toBeLessThan(open);
  await expect.poll(height, { timeout: 3_000 }).toBeLessThanOrEqual(closed + 1);
});
