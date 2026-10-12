import { expect, test } from '@playwright/test';

async function clickContinue(page: import('@playwright/test').Page) {
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
