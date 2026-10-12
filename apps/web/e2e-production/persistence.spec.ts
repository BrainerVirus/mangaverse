import { expect, test, type Page } from '@playwright/test';

async function clickContinue(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

test('Given finished onboarding, When the page reloads, Then setup is not repeated', async ({ page }) => {
  await page.goto('/onboarding');
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });

  await page.reload();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
});

test('Given a quiescent session, When onboarding finishes, Then the write is durable before navigation', async ({ page }) => {
  await page.goto('/onboarding');
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);

  // Let every prior debounced write settle so the only pending write is the finish.
  await page.waitForFunction(
    (key) => {
      const w = window as unknown as { __pingSeen?: string | null; __pingSince?: number };
      const current = localStorage.getItem(key);
      if (w.__pingSeen !== current) {
        w.__pingSeen = current;
        w.__pingSince = Date.now();
        return false;
      }
      return Date.now() - (w.__pingSince ?? 0) > 700;
    },
    'mangaverse.local-db.version',
    { timeout: 15_000 },
  );

  const pingBefore = await page.evaluate((key) => localStorage.getItem(key), 'mangaverse.local-db.version');
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });

  // Navigation must not happen until the finish write committed its snapshot.
  const pingAfter = await page.evaluate((key) => localStorage.getItem(key), 'mangaverse.local-db.version');
  expect(pingAfter).not.toBe(pingBefore);
});
