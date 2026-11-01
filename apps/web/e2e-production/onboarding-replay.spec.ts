import { expect } from '@playwright/test';

import { test } from './helpers.js';

test('Given completed onboarding, When it is reopened from the sidebar, Then it starts at step 1', async ({
  page,
  quickOnboarding,
}) => {
  await page.getByRole('link', { name: 'Onboarding' }).click();

  await expect(page.getByText('Step 1 of 5')).toBeVisible({ timeout: 10_000 });
});
