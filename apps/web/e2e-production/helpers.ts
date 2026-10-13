import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

export const fixturesDir = fileURLToPath(
  new URL('../../../packages/extensions-mangadex/src/fixtures/', import.meta.url),
);

export const MANGADEX_MANGA_ID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
export const MANGADEX_APP_MANGA_ID = `dev-md-${MANGADEX_MANGA_ID}`;


export function fixture(name: string): string {
  return readFileSync(`${fixturesDir}/${name}`, 'utf8');
}

export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

export interface ApiCalls {
  count: number;
}

/** Serves recorded MangaDex fixtures for the API and the at-home image CDN. */
export async function mockMangaDexApi(page: Page, calls?: ApiCalls) {
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

export async function finishOnboardingQuick(page: Page) {
  await page.goto('/onboarding');
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
}

export const PING_KEY = 'mangaverse.local-db.version';

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
