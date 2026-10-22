import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { fixturesDir, reloadDurable, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const SEARCH_FIXTURE = readFileSync(`${fixturesDir}/search.json`, 'utf8');
const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '1440', width: 1440, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`Given a saved search at ${viewport.label}px, When saved, applied and deleted, Then each state persists across reloads`, async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/search');

    const searchbox = page.getByRole('searchbox', { name: 'Search manga' });
    await expect(searchbox).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'All providers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'MangaDex' })).toBeVisible();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await searchbox.fill('berserk');
      try {
        await expect(page.getByRole('button', { name: 'Kuro no Shoukanshi' })).toBeVisible({
          timeout: 6_000,
        });
        break;
      } catch {
        await searchbox.fill('');
      }
    }

    // Provider attribution stays on the card; filters appear only with a query.
    await expect(page.getByText('mangadex').first()).toBeVisible();
    await expect(page.getByLabel('Sort results')).toBeVisible();

    await page.getByLabel('Language filter').fill('en');
    await page.getByRole('button', { name: 'Save search' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Saved search name').fill('Berserk in English');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Berserk in English', exact: true }),
    ).toBeVisible();

    // Saving is durable, not session state.
    await waitForPingQuiet(page);
    await reloadDurable(page);
    await expect(page.getByRole('button', { name: 'Berserk in English', exact: true })).toBeVisible(
      {
        timeout: 30_000,
      },
    );

    // Applying restores the query and the filters it was saved with.
    await expect(page.getByRole('searchbox', { name: 'Search manga' })).toHaveValue('');
    await page.getByRole('button', { name: 'Berserk in English', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search manga' })).toHaveValue('berserk');
    await expect(page.getByLabel('Language filter')).toHaveValue('en');

    await page.getByRole('button', { name: 'Delete saved search Berserk in English' }).click();
    await expect(page.getByRole('button', { name: 'Berserk in English', exact: true })).toHaveCount(
      0,
    );

    // Deleting is durable too.
    await waitForPingQuiet(page);
    await reloadDurable(page);
    await expect(page.getByRole('button', { name: 'Berserk in English', exact: true })).toHaveCount(
      0,
      {
        timeout: 30_000,
      },
    );
  });

  test(`Given one failing provider at ${viewport.label}px, When the search fails, Then results stay retryable and Retry recovers`, async ({
    page,
    quickOnboarding,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    let searchCalls = 0;
    let recovering = false;
    // Registered after the shared fixture route, so it wins for the search call.
    await page.route('**/api.mangadex.org/manga**', async (route) => {
      searchCalls += 1;
      if (!recovering) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: SEARCH_FIXTURE,
      });
    });

    await page.goto('/search');
    const searchbox = page.getByRole('searchbox', { name: 'Search manga' });
    await expect(searchbox).toBeVisible({ timeout: 30_000 });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await searchbox.fill('berserk');
      try {
        await expect(page.getByText('Provider search unavailable')).toBeVisible({
          timeout: 6_000,
        });
        break;
      } catch {
        await searchbox.fill('');
      }
    }

    // The provider retries on its own (one automatic retry) before settling as failed.
    await expect(page.getByText('Provider search unavailable')).toBeVisible({ timeout: 30_000 });
    recovering = true;
    // The failure is attributed and retried per provider, not by reloading the page.
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Kuro no Shoukanshi' })).toBeVisible({
      timeout: 30_000,
    });
    expect(searchCalls).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('Provider search unavailable')).toHaveCount(0);
  });
}
