import { expect } from '@playwright/test';
import { reloadDurable, test, waitForPingQuiet } from './helpers.js';

test('cache limit retains invalid drafts and saves corrections', async ({
  page,
  quickOnboarding,
}, testInfo) => {
  await page.goto('/settings/app');
  const input = page.getByLabel('Local cache limit');
  await expect(input).toHaveValue('500');
  await input.fill('20');
  await expect(page.getByText('Enter a cache limit between 50 and 10,240 MiB.')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(input).toHaveValue('20');
  await input.locator('..').screenshot({
    path: process.env.CACHE_DRAFT_SCREENSHOT ?? testInfo.outputPath('cache-limit-invalid.png'),
  });
  await input.fill('');
  await page.waitForTimeout(500);
  await expect(input).toHaveValue('');
  await input.fill('200');
  await input.blur();
  await waitForPingQuiet(page);
  await reloadDurable(page);
  await expect(input).toHaveValue('200');
});
