import { expect } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const IDS = ['title-a', 'title-b'];

for (const { oldUrl, newUrl, heading } of [
  { oldUrl: '/theme/editor', newUrl: '/advanced/theme', heading: 'Theme editor' },
  { oldUrl: '/diagnostics', newUrl: '/advanced/diagnostics', heading: 'Diagnostics' },
  { oldUrl: '/migration', newUrl: '/advanced/migration', heading: 'Migration' },
]) {
  test(`Given the old ${oldUrl} URL, When it opens, Then it lands on ${newUrl} with the same page`, async ({
    page,
    quickOnboarding,
  }) => {
    await page.goto(oldUrl);
    await expect(page).toHaveURL(new RegExp(`${newUrl}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(newUrl);
    await expect(page).toHaveURL(new RegExp(`${newUrl}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
}

test('Given an old migration link, When it opens, Then ids and source survive the redirect', async ({
  page,
  quickOnboarding,
}) => {
  const ids = encodeURIComponent(JSON.stringify(IDS));
  await page.goto(`/migration?ids=${ids}&source=mangadex`);

  await expect(page).toHaveURL(/\/advanced\/migration\?/, { timeout: 30_000 });
  const search = new URL(page.url()).searchParams;
  expect(JSON.parse(search.get('ids') ?? '[]')).toEqual(IDS);
  expect(search.get('source')).toBe('mangadex');
});

test('Given a bad old migration link, When it opens, Then the target still reports it', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/migration?ids=not-a-title-list');

  await expect(page).toHaveURL(/\/advanced\/migration\?/, { timeout: 30_000 });
  await expect(page.getByText(/title list in this link could not be read/)).toBeVisible({
    timeout: 30_000,
  });
});

test('Given the hub, When a tool is chosen, Then it opens and the sidebar lists each tool once', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/advanced');
  await expect(page.getByRole('heading', { name: 'Advanced', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const sidebar = page.locator('aside');
  for (const name of ['Advanced', 'Theme editor', 'Diagnostics', 'Migration']) {
    await expect(sidebar.getByRole('link', { name, exact: true })).toHaveCount(1);
  }

  await page
    .getByRole('region', { name: 'Advanced' })
    .getByRole('link', { name: /Diagnostics/ })
    .click();
  await expect(page).toHaveURL(/\/advanced\/diagnostics$/);
});
