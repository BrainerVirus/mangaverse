import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 90_000 });

const PING_KEY = 'mangaverse.local-db.version';

async function clickContinue(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

async function currentPing(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), PING_KEY);
}

/** Waits until a new committed snapshot ping appears, i.e. the write is durable. */
async function waitForDurableWrite(page: Page, previousPing: string | null) {
  await page.waitForFunction(
    ({ key, previous }) => localStorage.getItem(key) !== previous,
    { key: PING_KEY, previous: previousPing },
    { timeout: 20_000 },
  );
}

async function finishOnboarding(page: Page) {
  await page.goto('/onboarding');
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  const pingBefore = await currentPing(page);
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
  // Durability checkpoint: finish-state must be committed before reloading.
  await waitForDurableWrite(page, pingBefore);
  await page.reload();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
}

async function explicitContentSwitch(page: Page) {
  const switchControl = page.getByRole('switch', { name: 'Explicit content' });
  await expect(switchControl).toBeVisible({ timeout: 20_000 });
  return switchControl;
}

test('Given two tabs, When one commits a setting, Then the other converges after focus without a reload', async ({ context }) => {
  const tabA = await context.newPage();
  await finishOnboarding(tabA);
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
  await waitForDurableWrite(tabA, pingBefore);

  await tabA.reload();
  const afterReloadA = await explicitContentSwitch(tabA);
  await expect(afterReloadA).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });

  // Tab B was stale; focus alone must re-sync and refetch it.
  await tabB.bringToFront();
  const convergedB = await explicitContentSwitch(tabB);
  await expect(convergedB).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
});

test('Given two tabs that each commit a change, When both reload, Then both changes survive', async ({ context }) => {
  const tabA = await context.newPage();
  await finishOnboarding(tabA);

  const tabB = await context.newPage();
  await tabB.goto('/settings/app');
  const switchB = await explicitContentSwitch(tabB);
  const pingBefore = await currentPing(tabB);
  await switchB.click();
  await expect(switchB).toHaveAttribute('aria-checked', 'true');
  await waitForDurableWrite(tabB, pingBefore);

  await tabA.reload();
  await expect(tabA).toHaveURL(/\/library/, { timeout: 20_000 });

  await tabB.reload();
  const switchAfterReload = await explicitContentSwitch(tabB);
  await expect(switchAfterReload).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
});
