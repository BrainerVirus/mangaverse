import { expect } from '@playwright/test';

import { test } from './helpers.js';

test('Given completed onboarding, When it is reopened from the Settings hub, Then it starts at step 1', async ({
  page,
  quickOnboarding,
}) => {
  await page.locator('aside').getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Onboarding/ }).click();

  await expect(
    page.getByRole('navigation', { name: 'Onboarding steps' }).locator('[aria-current="step"]'),
  ).toHaveText('Welcome', { timeout: 10_000 });
});
