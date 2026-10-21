import { expect } from '@playwright/test';

import { test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Given the theme editor, When a custom theme is saved, duplicated and deleted, Then every change survives a reload', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/theme/editor');
  await expect(page.getByRole('heading', { name: 'Theme editor' })).toBeVisible({
    timeout: 30_000,
  });

  const name = page.getByLabel('Theme name');
  await expect(name).toBeEditable();
  await name.fill('E2E Custom');

  await expect(page.getByRole('tab', { name: 'Guided' })).toBeVisible();
  await page.getByRole('tab', { name: 'Advanced' }).click();
  await expect(page.getByTestId('theme-advanced-editor')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Guided' }).click();

  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect(page.getByRole('button', { name: 'Delete E2E Custom' })).toBeVisible({
    timeout: 20_000,
  });
  await waitForPingQuiet(page);

  // The gallery reads the themes table, so a card after reload proves the row
  // outlived the in-memory draft.
  await page.goto('/theme');
  await expect(page.getByRole('button', { name: 'Select E2E Custom theme' })).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Select E2E Custom theme' })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole('button', { name: 'Edit E2E Custom theme' }).click();
  await expect(page.getByRole('heading', { name: 'Theme editor' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel('Theme name')).toHaveValue('E2E Custom');

  await page.getByRole('button', { name: 'Duplicate E2E Custom' }).click();
  await expect(page.getByLabel('Theme name')).toHaveValue('E2E Custom copy');
  await expect(page.getByRole('button', { name: 'Delete E2E Custom', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect(page.getByRole('button', { name: 'Delete E2E Custom copy' })).toBeVisible({
    timeout: 20_000,
  });
  await waitForPingQuiet(page);

  await page.goto('/theme');
  await expect(page.getByRole('button', { name: 'Select E2E Custom copy theme' })).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Select E2E Custom copy theme' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: 'Select E2E Custom theme' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete E2E Custom copy theme' }).click();
  await page.getByRole('button', { name: 'Delete theme', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select E2E Custom copy theme' })).toHaveCount(0, {
    timeout: 20_000,
  });
  await waitForPingQuiet(page);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Select E2E Custom copy theme' })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: 'Select E2E Custom theme' })).toBeVisible();
});
