import { expect } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, settledBox, test } from './helpers.js';

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
  const open = Math.round((await settledBox(section)).height);
  expect(open).toBeGreaterThan(closed + 20);
  expect(mid).toBeGreaterThan(closed);
  expect(mid).toBeLessThan(open);

  await toggle.click();
  await page.waitForTimeout(90);
  const midClosing = await height();
  expect(midClosing).toBeGreaterThan(closed);
  expect(midClosing).toBeLessThan(open);
  await expect.poll(height, { timeout: 3_000 }).toBeLessThanOrEqual(closed + 1);
});

test('Given settings sections that are open from the start, When the page loads, Then none eases in from zero height', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/settings/app');
  await expect(page.getByRole('heading', { name: 'App settings' })).toBeVisible({
    timeout: 40_000,
  });

  // Only a collapsible section uses the easing wrapper; an always-open one must render at its
  // full height from the first frame, so there is no wrapper to find and nothing to grow.
  await expect(page.locator('.collapsible-grid')).toHaveCount(0);
  const first = page.locator('section, [data-slot="card"]').first();
  const before = Math.round((await first.boundingBox())!.height);
  await page.waitForTimeout(400);
  expect(Math.round((await first.boundingBox())!.height)).toBe(before);
});
