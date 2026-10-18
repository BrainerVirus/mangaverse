import { expect } from '@playwright/test';

import { clickContinue, currentPing, test, waitForPingQuiet } from './helpers.js';

test('Given finished onboarding, When the page reloads, Then setup is not repeated', async ({
  page,
  quickOnboarding,
}) => {
  await page.reload();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
});

test('Given a quiescent session, When onboarding finishes, Then the write is durable before navigation', async ({
  page,
}) => {
  await page.goto('/onboarding');
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);

  // Let every prior debounced write settle so the only pending write is the finish.
  await waitForPingQuiet(page);

  const pingBefore = await currentPing(page);
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });

  // Navigation must not happen until the finish write committed its snapshot.
  const pingAfter = await currentPing(page);
  expect(pingAfter).not.toBe(pingBefore);
});
