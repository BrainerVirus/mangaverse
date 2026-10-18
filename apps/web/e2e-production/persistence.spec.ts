import { expect } from '@playwright/test';

import { clickContinue, currentPing, test, waitForPingQuiet } from './helpers.js';

test('Given finished onboarding, When the page reloads, Then setup is not repeated', async ({
  page,
  quickOnboarding,
}) => {
  await page.reload();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
});

test('Given the onboarding theme step, When Dark is toggled and the page reloads at once, Then the theme survives', async ({
  page,
}) => {
  await page.goto('/onboarding');
  await clickContinue(page);

  const darkToggle = page.getByRole('switch', { name: 'Dark appearance' });
  await darkToggle.click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  // The saving indicator clears only when the theme write settles, so the
  // reload below fires straight after it -- no deliberate wait, and no way to
  // fall into a gap the ~400 ms coalesced flush would still cover.
  await expect(darkToggle).toBeEnabled();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled({
    timeout: 20_000,
  });
  // The settings row hydrates a beat after load; a stale row would flip the
  // theme back to light inside that window, so assert once the session is quiet.
  await waitForPingQuiet(page);
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
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
