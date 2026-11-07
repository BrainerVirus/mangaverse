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

  await page.evaluate(() => {
    const target = window as unknown as { __savingFlashed?: boolean };
    target.__savingFlashed = false;
    const observer = new MutationObserver(() => {
      if (document.body.innerText.includes('Saving…')) target.__savingFlashed = true;
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.setTimeout(() => observer.disconnect(), 1_500);
  });
  await page.getByRole('button', { name: 'Save theme' }).click();
  await page.waitForTimeout(250);
  const flashed = await page.evaluate(
    () => (window as unknown as { __savingFlashed?: boolean }).__savingFlashed === true,
  );
  expect(flashed).toBe(false);
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

test('Given the theme gallery, When descriptions differ in length, Then the previews and names align', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/theme');
  const names = ['Minimal', 'Minimal Light', 'Minimal Dark'] as const;
  const previews = page.locator('[data-theme-preview]');
  await expect(previews.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Select Minimal theme' })).toBeVisible();

  const heights = await previews.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

  const tops = await Promise.all(
    names.map(async (name) => {
      const box = await page
        .getByRole('button', { name: `Select ${name} theme` })
        .locator('p')
        .first()
        .boundingBox();
      return box?.y ?? 0;
    }),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
});
