import { expect, type Page } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const EVENT_LOG_KEY = 'mangaverse.diagnostics.event-log.v1';
const INTERNAL_TEXT = 'INTERNAL_SECRET at db.handle.run';
const toasts = (page: Page) => page.locator('[data-sonner-toast]');

/** The only browser call behind a real production mutation that a test can hold or fail. */
async function stubPersist(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const control = { delayMs: 0, fail: false };
    Object.assign(window, { __persist: control });
    StorageManager.prototype.persist = async () => {
      await new Promise((resolve) => setTimeout(resolve, control.delayMs));
      if (control.fail) throw new Error('INTERNAL_SECRET persist handle broken');
      return true;
    };
  });
}

async function setPersist(page: Page, delayMs: number, fail: boolean): Promise<void> {
  await page.evaluate(
    (next) => {
      Object.assign((window as unknown as { __persist: object }).__persist, next);
    },
    { delayMs, fail },
  );
}

/** Records whether "Saving…" ever enters the DOM, however briefly. */
async function watchForSaving(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = { seen: false };
    Object.assign(window, { __saving: state });
    new MutationObserver(() => {
      if (document.body.textContent?.includes('Saving…')) state.seen = true;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

const sawSaving = (page: Page) =>
  page.evaluate(() => (window as unknown as { __saving: { seen: boolean } }).__saving.seen);

async function openStorage(page: Page) {
  await page.goto('/storage');
  const request = page.getByRole('button', { name: 'Request persistent storage' });
  await expect(request).toBeEnabled({ timeout: 30_000 });
  return request;
}

test('Given an unknown URL, When it loads, Then a 404 page leads back to the library', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/this/does/not/exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('link', { name: 'Back to library' }).click();
  await expect(page).toHaveURL(/\/library/);
});

test('Given a route throws internal text, When it renders, Then a status page recovers and only the log has the text', async ({
  page,
  quickOnboarding,
}) => {
  await expect(page.getByRole('link', { name: 'Library' }).first()).toBeVisible();
  await page.route(/\/assets\/diagnostics\.lazy[^/]*\.js/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `throw new Error(${JSON.stringify(INTERNAL_TEXT)});`,
    }),
  );
  await page.getByRole('link', { name: 'Diagnostics' }).first().click();

  await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('INTERNAL_SECRET');
  await page.getByRole('link', { name: 'Back to library' }).click();
  await expect(page).toHaveURL(/\/library/);
});

test('Given provider failure, When Discover loads, Then an inline retry recovers it without a toast', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  let failing = true;
  await page.route('**/api.mangadex.org/manga?**', async (route) => {
    if (failing) await route.fulfill({ status: 503, body: 'upstream token=abc123 exploded' });
    else await route.fallback();
  });

  await page.goto('/discover');
  await expect(page.getByText('Could not load discover feed')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('body')).not.toContainText('abc123');
  await expect(toasts(page)).toHaveCount(0);

  failing = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Could not load discover feed')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Kuro no Shoukanshi' }).first()).toBeVisible();
});

test('Given a title with no chapters, When its page loads, Then it says so with no error or undefined-query log', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  const logged: string[] = [];
  page.on('console', (message) => logged.push(message.text()));
  await page.route(/api\.mangadex\.org\/manga\/[^/?]+\/feed/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: 'ok', data: [], limit: 0, offset: 0, total: 0 }),
    }),
  );

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await expect(page.getByText('No chapters available')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Could not load chapters')).toHaveCount(0);
  expect(logged.filter((text) => text.includes('Query data cannot be undefined'))).toEqual([]);

  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible({
    timeout: 30_000,
  });
  expect(logged.filter((text) => text.includes('Query data cannot be undefined'))).toEqual([]);
});

test('Given a save over 300ms, When it succeeds, Then Saving resolves to Saved', async ({
  page,
  quickOnboarding,
}) => {
  await stubPersist(page);
  const request = await openStorage(page);

  await setPersist(page, 900, false);
  await request.click();
  await expect(toasts(page).getByText('Saving…')).toBeVisible();
  await expect(toasts(page).getByText('Saved', { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(toasts(page).getByText('Saving…')).toHaveCount(0);
});

test('Given a save under 300ms, When it succeeds, Then no Saving state flashes', async ({
  page,
  quickOnboarding,
}) => {
  await stubPersist(page);
  const request = await openStorage(page);
  await watchForSaving(page);

  await setPersist(page, 0, false);
  await request.click();
  await expect(page.getByText('Persistent storage granted.')).toBeVisible();
  await page.waitForTimeout(600);
  expect(await sawSaving(page)).toBe(false);
  await expect(toasts(page)).toHaveCount(0);

  // A real local settings write, with no stub in its path.
  await page.goto('/settings/app');
  const explicit = page.getByRole('switch', { name: 'Explicit content' });
  await expect(explicit).toBeVisible({ timeout: 30_000 });
  await watchForSaving(page);
  await explicit.click();
  await page.waitForTimeout(1_200);
  expect(await sawSaving(page)).toBe(false);
});

test('Given a slow save fails repeatedly, When toasts fire, Then one toast offers a retry that works and the log is redacted', async ({
  page,
  quickOnboarding,
}) => {
  const external: string[] = [];
  await stubPersist(page);
  const request = await openStorage(page);
  page.on('request', (sent) => {
    if (!sent.url().startsWith(new URL(page.url()).origin)) external.push(sent.url());
  });

  await setPersist(page, 1_500, true);
  await request.click();
  await expect(toasts(page).getByText('Saving…')).toBeVisible();
  const failure = toasts(page).getByText('Could not request persistent storage.');
  await expect(failure).toBeVisible({ timeout: 8_000 });
  await expect(toasts(page).getByText('Saving…')).toHaveCount(0);

  await setPersist(page, 0, true);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await request.click();
    await expect(request).toBeEnabled();
  }
  await expect(failure).toHaveCount(1);
  await expect(toasts(page)).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('INTERNAL_SECRET');

  await setPersist(page, 0, false);
  await toasts(page).getByRole('button', { name: 'Retry' }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByText('Persistent storage granted.')).toBeVisible();

  await expect(async () => {
    const stored = await page.evaluate((key) => localStorage.getItem(key), EVENT_LOG_KEY);
    expect(stored).toContain('persist handle broken');
  }).toPass({ timeout: 5_000 });
  expect(external).toEqual([]);

  await page.goto('/diagnostics');
  const log = page.getByRole('region', { name: 'Event log' });
  await expect(log.getByText(/persist handle broken/).first()).toBeVisible({ timeout: 30_000 });
});

test('Given a phone and reduced motion, When a toast shows, Then it sits above the bottom nav and does not animate', async ({
  page,
  quickOnboarding,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubPersist(page);
  const request = await openStorage(page);

  await setPersist(page, 0, true);
  await request.click();
  const toast = toasts(page).first();
  await expect(toast).toBeVisible();

  const nav = page.locator('nav').filter({ has: page.getByRole('link', { name: 'Discover' }) });
  const toastBox = await toast.boundingBox();
  const navBox = await nav.last().boundingBox();
  expect(toastBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox!.y);

  const motion = await toast.evaluate((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, transition: style.transitionDuration };
  });
  expect(motion.animation).toBe('none');
  expect(motion.transition).toBe('0s');
});

test('Given someone is reading, When a chapter cannot load, Then the reader says so and no toast shows', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.route('**/api.mangadex.org/at-home/**', (route) => route.abort('failed'));
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: /^Chapter|Ch\./ }).first();
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('Could not load chapter')).toBeVisible({ timeout: 30_000 });
  await expect(toasts(page)).toHaveCount(0);
});
