import { expect, test } from '@playwright/test';

test('Given a fresh production app, when opened, then onboarding hydrates and is interactive', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Welcome to MangaVerse' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose your look' })).toBeVisible();
  expect(errors).toEqual([]);
});
