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

test('Given 120 search results, When they mount and scroll, Then cards stay bounded and the last result is reachable', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  const fixture = JSON.parse(SEARCH_FIXTURE) as {
    data: Array<{ attributes: Record<string, unknown> }>;
  };
  const [template] = fixture.data;
  const data = Array.from({ length: 120 }, (_, index) => ({
    ...template,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    attributes: {
      ...template?.attributes,
      title: { en: `Bulk Title ${index + 1}` },
      altTitles: [],
    },
  }));
  await page.route('**/api.mangadex.org/manga?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...fixture, data, limit: 120, total: 120 }),
    });
  });

  // A MutationObserver only fires after React's synchronous measured re-render,
  // so record the count at each DOM insertion to catch the first commit too.
  await page.addInitScript(() => {
    const selector = '[data-testid="search-results-grid"]';
    const w = window as unknown as { __maxSearchCards?: number };
    w.__maxSearchCards = 0;
    const record = (parent: Node, inserted: Node) => {
      const grid =
        (inserted instanceof Element && inserted.closest(selector)) ||
        (parent instanceof Element && parent.closest(selector));
      if (grid) {
        const cards = grid.querySelectorAll('button').length;
        w.__maxSearchCards = Math.max(w.__maxSearchCards ?? 0, cards);
      }
    };
    // oxlint-disable-next-line typescript/unbound-method -- the originals are only invoked through .call below
    const { appendChild, insertBefore } = Node.prototype;
    Node.prototype.appendChild = function <T extends Node>(this: Node, node: T): T {
      const result = appendChild.call(this, node) as T;
      record(this, node);
      return result;
    };
    Node.prototype.insertBefore = function <T extends Node>(
      this: Node,
      node: T,
      child: Node | null,
    ): T {
      const result = insertBefore.call(this, node, child) as T;
      record(this, node);
      return result;
    };
  });

  await page.goto('/search');
  const searchbox = page.getByRole('searchbox', { name: 'Search manga' });
  await expect(searchbox).toBeVisible({ timeout: 30_000 });
  const firstCard = page.getByRole('button', { name: /Bulk Title 1\b/ });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await searchbox.fill('bulk');
    try {
      await expect(firstCard).toBeVisible({ timeout: 6_000 });
      break;
    } catch {
      await searchbox.fill('');
    }
  }
  await expect(firstCard).toBeVisible();

  const grid = page.getByTestId('search-results-grid');
  const maxCards = () =>
    page.evaluate(() => (window as unknown as { __maxSearchCards: number }).__maxSearchCards);
  expect(await maxCards()).toBeLessThanOrEqual(48);
  expect(await grid.getByRole('button').count()).toBeLessThanOrEqual(48);

  const lastCard = page.getByRole('button', { name: /Bulk Title 120\b/ });
  await expect(lastCard).toHaveCount(0);
  await expect(async () => {
    await page.locator('main').evaluate((main) => {
      main.scrollTop = main.scrollHeight;
    });
    await expect(lastCard).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  expect(await grid.getByRole('button').count()).toBeLessThanOrEqual(48);
});

test('Given a selected provider and a tag draft, When both are edited, Then the selection clears and the commas survive', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/search');

  const searchbox = page.getByRole('searchbox', { name: 'Search manga' });
  await expect(searchbox).toBeVisible({ timeout: 30_000 });
  await searchbox.fill('berserk');

  const mangadex = page.getByRole('button', { name: 'MangaDex', exact: true });
  await expect(mangadex).toBeVisible({ timeout: 30_000 });
  await mangadex.click();
  await expect(mangadex).toHaveAttribute('aria-pressed', 'true');

  const allProviders = page.getByRole('button', { name: 'All providers' });
  await allProviders.click();
  await expect(allProviders).toHaveAttribute('aria-pressed', 'true');
  await expect(mangadex).toHaveAttribute('aria-pressed', 'false');

  const tags = page.getByLabel('Included tags');
  await tags.click();
  await tags.pressSequentially('action, comedy', { delay: 20 });
  await expect(tags).toHaveValue('action, comedy');
  await tags.press('Enter');
  await expect(tags).toHaveValue('action, comedy');
});
