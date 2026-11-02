import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type Locator, type Page } from '@playwright/test';

export const fixturesDir = fileURLToPath(
  new URL('../../../packages/extensions/src/mangadex/fixtures/', import.meta.url),
);

const MANGADEX_MANGA_ID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
export const MANGADEX_APP_MANGA_ID = `dev-md-${MANGADEX_MANGA_ID}`;

function fixture(name: string): string {
  return readFileSync(`${fixturesDir}/${name}`, 'utf8');
}

export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

export interface ApiCalls {
  count: number;
}

/**
 * CI runners report few cores, which resolves the shell's cheap glass profile.
 * Tests that assert full glass must pin capable hardware before the app loads.
 */
export async function stubCapableHardware(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
  });
}

/** Serves recorded MangaDex fixtures for the API and the at-home image CDN. */
async function mockMangaDexApi(page: Page, calls?: ApiCalls) {
  await page.route('**/api.mangadex.org/**', async (route) => {
    if (calls) calls.count += 1;
    const url = route.request().url();
    let body: string;
    if (url.includes('/at-home/server/')) {
      body = fixture('at-home.json');
    } else if (/\/manga\/[^/?]+\/feed/.test(url)) {
      body = fixture('feed.json');
    } else if (/\/manga\/[^/?]+(\?|$)/.test(url)) {
      body = fixture('detail.json');
    } else {
      body = fixture('search.json');
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.route('**/uploads.mangadex.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
  await page.route('**/*.mangadex.network/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
}

export async function clickContinue(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

async function advanceOnboarding(page: Page) {
  await page.goto('/onboarding');
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
}

async function finishOnboardingQuick(page: Page) {
  await advanceOnboarding(page);
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
}

/**
 * Opens the command palette without racing hydration. React attaches the
 * window-level shortcut in an effect, so a key pressed during the initial load
 * is dropped; opening is idempotent for as long as we only press while the
 * dialog is closed. A palette that never opens still fails in this helper.
 */
export async function openCommandPalette(page: Page): Promise<Locator> {
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(async () => {
    if (!(await palette.isVisible())) {
      await page.keyboard.press('ControlOrMeta+k');
    }
    await expect(palette).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  return palette;
}

const PING_KEY = 'mangaverse.local-db.version';

export async function currentPing(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), PING_KEY);
}

/** Waits until a new committed snapshot ping appears, i.e. the write is durable. */
export async function waitForNewPing(page: Page, previousPing: string | null) {
  await page.waitForFunction(
    ({ key, previous }) => localStorage.getItem(key) !== previous,
    { key: PING_KEY, previous: previousPing },
    { timeout: 20_000 },
  );
}

/**
 * Waits until no snapshot ping has changed for `quietMs`. A stable ping is
 * stronger than "a ping happened": the reader's 750 ms progress debounce plus
 * the 400 ms coalesced flush both land inside the quiet window, so quiescence
 * means any pending progress write is already durable.
 */
export async function waitForPingQuiet(page: Page, quietMs = 1500) {
  // Arm a fresh window on every call: measuring from the last *observed* change
  // makes a second call return immediately, which once let the caller reload
  // before the 750 ms progress debounce had fired and the write never landed.
  await page.evaluate((key) => {
    const w = window as unknown as { __pingSeen?: string | null; __pingSince?: number };
    w.__pingSeen = localStorage.getItem(key);
    w.__pingSince = Date.now();
  }, PING_KEY);
  await page.waitForFunction(
    ({ key, quiet }) => {
      const w = window as unknown as { __pingSeen?: string | null; __pingSince?: number };
      const current = localStorage.getItem(key);
      if (w.__pingSeen !== current) {
        w.__pingSeen = current;
        w.__pingSince = Date.now();
        return false;
      }
      return Date.now() - (w.__pingSince ?? 0) > quiet;
    },
    { key: PING_KEY, quiet: quietMs },
    { timeout: 20_000 },
  );
}

/**
 * Reloads only once the snapshot write is durable: with `previousPing`, waits
 * for that write's commit ping; otherwise for the coalesced flush to go quiet.
 * The navigation waits for `domcontentloaded` (nothing asserts on subresources)
 * with a 15 s bound -- ~500x the idle reload, still far below the test budget,
 * so a stalled load under load fails fast instead of looking like a hang.
 * Reloading inside the flush window would drop the write: an IndexedDB
 * transaction opened from `pagehide` never commits once the document is
 * discarded.
 */
export async function reloadDurable(page: Page, previousPing?: string | null): Promise<void> {
  if (previousPing === undefined) {
    await waitForPingQuiet(page);
  } else {
    await waitForNewPing(page, previousPing);
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
}

/**
 * The suite's shared test: recorded MangaDex routes and provider-less
 * onboarding as fixtures, so specs only carry their own flow assertions.
 */
export const test = base.extend<{
  /** Recorded MangaDex responses plus the count of API calls they served. */
  mockMangaDex: ApiCalls;
  /** Completes onboarding without a provider and lands on /library. */
  quickOnboarding: void;
  /** Quick onboarding plus a durable-write checkpoint and reload. */
  durableOnboarding: void;
}>({
  mockMangaDex: async ({ page }, use) => {
    const calls: ApiCalls = { count: 0 };
    await mockMangaDexApi(page, calls);
    await use(calls);
  },
  quickOnboarding: async ({ page }, use) => {
    await finishOnboardingQuick(page);
    await use();
  },
  durableOnboarding: async ({ page }, use) => {
    await advanceOnboarding(page);
    const pingBefore = await currentPing(page);
    await page.getByRole('button', { name: 'Finish without provider' }).click();
    await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
    // Durability checkpoint: finish-state must be committed before reloading.
    await reloadDurable(page, pingBefore);
    await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
    await use();
  },
});
