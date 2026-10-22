import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixturesDir, MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;

async function openReader(page: Page, chapter = CHAPTER_BUTTON) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const button = page.getByRole('button', { name: chapter });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

async function openReaderSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeReader(page: Page) {
  await page.getByRole('button', { name: 'Close reader', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/manga/${MANGADEX_APP_MANGA_ID}`));
}

test('marking a chapter read and unread persists into the resume position', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);

  await page.getByRole('button', { name: 'Chapter actions' }).click();
  const actions = page.getByRole('dialog', { name: 'Chapter actions' });
  await actions.getByRole('button', { name: 'Mark chapter read' }).click();
  await expect(page.getByTestId('reader-status')).toContainText('Chapter marked read');
  // The action stays in the reader instead of navigating away.
  await expect(page.getByText('1 / 37')).toBeVisible();
  await waitForPingQuiet(page);
  await closeReader(page);

  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page.getByText('37 / 37')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Chapter actions' }).click();
  await page
    .getByRole('dialog', { name: 'Chapter actions' })
    .getByRole('button', { name: 'Mark chapter unread' })
    .click();
  await expect(page.getByTestId('reader-status')).toContainText('Chapter marked unread');
  await waitForPingQuiet(page);
  await closeReader(page);

  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
});

test('marking previous chapters read persists the earlier chapter completion', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  const feed = JSON.parse(readFileSync(`${fixturesDir}/feed.json`, 'utf8'));
  const next = structuredClone(feed.data[0]);
  next.id = '11111111-1111-4111-8111-111111111111';
  next.attributes.chapter = '2';
  next.attributes.title = 'The next chapter';
  feed.data = [feed.data[0], next];
  feed.total = 2;
  await page.route('**/manga/*/feed?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed) }),
  );

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  // Hydrate the earlier chapter once so marking it read knows its page count.
  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  await waitForPingQuiet(page);
  await closeReader(page);

  await page.getByRole('button', { name: /Ch\. 2 - The next chapter/ }).click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Chapter actions' }).click();
  await page
    .getByRole('dialog', { name: 'Chapter actions' })
    .getByRole('button', { name: 'Mark previous chapters read' })
    .click();
  await expect(page.getByTestId('reader-status')).toContainText('Previous chapters marked read');
  await waitForPingQuiet(page);
  await closeReader(page);

  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page.getByText('37 / 37')).toBeVisible({ timeout: 30_000 });
});

test('the shortcut editor saves a binding, rejects conflicts, and the reader applies it', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto('/settings/reader');

  // Conflict first: 'n' is already saved for Next page below.
  const changeNext = page.getByRole('button', { name: 'Change shortcut for Next page' });
  await changeNext.click();
  await page.keyboard.press('n');
  await expect(changeNext).toHaveText('N');
  await waitForPingQuiet(page);

  const changePrev = page.getByRole('button', { name: 'Change shortcut for Previous page' });
  await changePrev.click();
  await page.keyboard.press('n');
  await expect(page.getByRole('alert')).toContainText('already used for Next page');
  await changePrev.click();
  await waitForPingQuiet(page);

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('n');
  await expect(page.getByText('2 / 37')).toBeVisible();

  // Reset to defaults clears the saved list and restores the arrow binding.
  await closeReader(page);
  await page.goto('/settings/reader');
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await waitForPingQuiet(page);
  await expect(page.getByRole('button', { name: 'Change shortcut for Next page' })).toHaveText('→');
});

test('source attribution, page transitions and diagnostics are visible in the reading surface', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  await page.goto('/settings/reader');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('switch', { name: 'Diagnostics', exact: true }).click();
  await page.getByRole('combobox', { name: 'Page transition', exact: true }).click();
  await page.getByRole('option', { name: 'Slide', exact: true }).click();
  await waitForPingQuiet(page);

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('reader-source')).toHaveText('MangaDex');
  const layer = page.getByTestId('reader-zoom-layer');
  await expect(layer).toHaveAttribute('data-page-transition', 'slide');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 / 37')).toBeVisible();

  const dialog = await openReaderSettings(page);
  const diagnostics = dialog.getByTestId('reader-diagnostics');
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics).toContainText('Reader diagnostics');
  await expect(diagnostics).toContainText('Cache hits');
  await diagnostics.getByRole('button', { name: 'Clear diagnostics' }).click();
  await expect(diagnostics.locator('dd').first()).toHaveText('0');
  await page.screenshot({ path: testInfo.outputPath('reader-diagnostics.png') });
});

test('image smoothing and long-strip optimization change how pages render', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  await page.goto('/settings/reader');
  await page.getByRole('switch', { name: 'Image smoothing', exact: true }).click();
  await page.getByRole('combobox', { name: 'Reading mode', exact: true }).click();
  await page.getByRole('option', { name: 'Vertical (webtoon)', exact: true }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Long strip optimization' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await waitForPingQuiet(page);

  // A long strip is 7.5 screens tall; optimization keeps the mounted window at
  // one page either side instead of the configured preload amount.
  await page.route('**/*.mangadex.network/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="6000"><rect width="800" height="6000" fill="white"/></svg>',
    }),
  );

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  const strip = page.getByTestId('reader-scroll-view');
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip.locator('img').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => strip.locator('img').count(), { timeout: 20_000 }).toBeLessThanOrEqual(3);
  await expect(strip.locator('img').first()).toHaveCSS('image-rendering', 'pixelated');
  await page.screenshot({ path: testInfo.outputPath('reader-long-strip.png') });
});

test('keep-awake requests a screen lock where the platform supports it', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.addInitScript(() => {
    const target = window as unknown as {
      __wakeRequests?: number;
      navigator: Navigator & { wakeLock?: unknown };
    };
    target.__wakeRequests = 0;
    Object.defineProperty(target.navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          target.__wakeRequests = (target.__wakeRequests ?? 0) + 1;
          return { release: async () => {} };
        },
      },
    });
  });

  await openReader(page);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __wakeRequests?: number }).__wakeRequests ?? 0),
    )
    .toBeGreaterThan(0);
});
