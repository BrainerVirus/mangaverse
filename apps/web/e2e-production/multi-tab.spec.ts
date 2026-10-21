import { expect, type Page } from '@playwright/test';

import { currentPing, reloadDurable, test, waitForNewPing } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

async function explicitContentSwitch(page: Page) {
  const switchControl = page.getByRole('switch', { name: 'Explicit content' });
  await expect(switchControl).toBeVisible({ timeout: 20_000 });
  return switchControl;
}

test('Given two tabs, When one commits a setting, Then the other converges after focus without a reload', async ({
  page,
  context,
  durableOnboarding,
}) => {
  const tabA = page;
  await tabA.goto('/settings/app');
  const switchA = await explicitContentSwitch(tabA);
  await expect(switchA).toHaveAttribute('aria-checked', 'false');

  const tabB = await context.newPage();
  await tabB.goto('/settings/app');
  const switchB = await explicitContentSwitch(tabB);
  await expect(switchB).toHaveAttribute('aria-checked', 'false');

  await tabA.bringToFront();
  const pingBefore = await currentPing(tabA);
  await switchA.click();
  await expect(switchA).toHaveAttribute('aria-checked', 'true');
  // Durability checkpoint: wait for the committed snapshot ping before reload.
  await reloadDurable(tabA, pingBefore);
  const afterReloadA = await explicitContentSwitch(tabA);
  await expect(afterReloadA).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });

  // Tab B was stale; focus alone must re-sync and refetch it.
  await tabB.bringToFront();
  const convergedB = await explicitContentSwitch(tabB);
  await expect(convergedB).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
});

test('Given two tabs that each commit a change, When both reload, Then both changes survive', async ({
  page,
  context,
  durableOnboarding,
}) => {
  const tabA = page;

  const tabB = await context.newPage();
  await tabB.goto('/settings/app');
  const switchB = await explicitContentSwitch(tabB);
  const pingBefore = await currentPing(tabB);
  await switchB.click();
  await expect(switchB).toHaveAttribute('aria-checked', 'true');
  await waitForNewPing(tabB, pingBefore);

  await reloadDurable(tabA);
  await expect(tabA).toHaveURL(/\/library/, { timeout: 20_000 });

  await reloadDurable(tabB);
  const switchAfterReload = await explicitContentSwitch(tabB);
  await expect(switchAfterReload).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
});

test('Given a setting write, When the tab reloads right after it commits, Then the write is durable without a stall', async ({
  page,
  durableOnboarding,
}) => {
  await page.goto('/settings/app');
  const setting = await explicitContentSwitch(page);
  const pingBefore = await currentPing(page);
  await setting.click();
  await expect(setting).toHaveAttribute('aria-checked', 'true');

  // No explicit flush call: the ping below is the scheduled post-mutation
  // flush's commit, so a reload that follows it cannot depend on pagehide
  // (whose IndexedDB work never commits). Reloading inside the flush window
  // races an in-flight transaction and would drop the write.
  await reloadDurable(page, pingBefore);
  const afterReload = await explicitContentSwitch(page);
  await expect(afterReload).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
});
