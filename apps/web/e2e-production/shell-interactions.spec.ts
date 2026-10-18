import { expect } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

test('Given the shell, When a navigation command runs from the palette, Then the app navigates', async ({
  page,
  quickOnboarding,
}) => {
  await expect(page).toHaveURL(/\/library/);

  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();

  await page.getByLabel('Search commands').fill('discover');
  await expect(palette.getByText('Go to Discover')).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 });
  await expect(palette).toBeHidden();
});

test('Given the palette is open, When Escape is pressed, Then it closes without navigating', async ({
  page,
  quickOnboarding,
}) => {
  await expect(page).toHaveURL(/\/library/);

  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  await expect(page).toHaveURL(/\/library/);
});
