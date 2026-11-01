import { readFile } from 'node:fs/promises';

import { expect } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const EVENT_LOG_KEY = 'mangaverse.diagnostics.event-log.v1';
const EVENT_LOG_LOCK = 'mangaverse-event-log.v1';

/** Seeded events deliberately carry a bearer token, a URL query and password. */
const SEEDED_EVENTS = [
  {
    id: 'seed-error',
    at: '2026-05-23T10:00:02.000Z',
    kind: 'error',
    message:
      'Bearer abc.def GET https://api.mangadex.org/manga?token=s3cret&page=2 failed: password=hunter2',
    code: 'Bearer abc.def',
    providerId: 'mangadex',
  },
  {
    id: 'seed-slow',
    at: '2026-05-23T10:00:01.000Z',
    kind: 'slow-provider-call',
    message: 'Search https://api.mangadex.org/manga?limit=10 took too long',
    providerId: 'mangadex',
    durationMs: 1200,
  },
  {
    id: 'seed-reader',
    at: '2026-05-23T10:00:00.000Z',
    kind: 'reader-timing',
    message: 'Chapter page used https://x.test/pages/1?api_key=zzz password=[redacted] REMAINDER',
    durationMs: 180,
  },
  {
    id: 'seed-password',
    at: '2026-05-23T09:59:59.000Z',
    kind: 'error',
    message: '{"password":"SECRET FIRST SECOND"} password=SECRET TAIL',
  },
  {
    id: 'seed-cookie',
    at: '2026-05-23T09:59:58.000Z',
    kind: 'error',
    message: '{"Set-Cookie":{"nested":{"session":"SECRETNEST"},"other":"SECRETTAIL"}}',
  },
  {
    id: 'seed-apostrophe',
    at: '2026-05-23T09:59:57.000Z',
    kind: 'error',
    message: "password='it's a secret tail'",
  },
] as const;

const SEEDED_FRAGMENTS = [
  'FIRST SECOND',
  'SECRET TAIL',
  'SECRETNEST',
  'SECRETTAIL',
  'REMAINDER',
  'a secret tail',
];

test('Given seeded token-bearing events, When Diagnostics loads, filters, clears and exports, Then it makes no network request and the export carries no credential', async ({
  page,
  quickOnboarding,
}) => {
  await page.addInitScript(
    ({ key, events }) => {
      localStorage.setItem(key, JSON.stringify(events));
    },
    { key: EVENT_LOG_KEY, events: SEEDED_EVENTS },
  );

  await page.goto('/diagnostics');
  const section = page.getByRole('region', { name: 'Event log' });
  await expect(section).toBeVisible({ timeout: 20_000 });
  const panel = (name: string) => section.getByRole('tabpanel', { name });
  await expect(panel('All').getByText('error', { exact: true })).toHaveCount(4);
  await expect(
    panel('All').getByText('{"password":"[redacted]"} password=[redacted]'),
  ).toBeVisible();
  await expect(panel('All').getByText('{"Set-Cookie":"[redacted]"}')).toBeVisible();
  await expect(panel('All').getByText("password='[redacted]'", { exact: true })).toBeVisible();
  await expect(panel('All').getByText('2026-05-23T10:00:02.000Z')).toBeVisible();
  await expect(
    panel('All').getByText('Bearer [redacted] GET https://api.mangadex.org/manga'),
  ).toBeVisible();

  // Covers only the Diagnostics operations below (filter, export, clear), so it
  // starts after the page load, which legitimately fetches app assets. No app
  // code records events yet; the unit test in packages/diagnostics/src/event-log.test.ts
  // spies fetch, XHR and sendBeacon during `record`.
  const outbound: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    outbound.push(url);
  });

  await section.getByRole('tab', { name: 'Errors' }).click();
  await expect(panel('Errors').getByText('error', { exact: true })).toHaveCount(4);
  await expect(
    panel('Errors').getByText(/Search https:\/\/api\.mangadex\.org\/manga took too long/),
  ).toHaveCount(0);

  await section.getByRole('tab', { name: 'Reader timing' }).click();
  await expect(
    panel('Reader timing').getByText('Chapter page used https://x.test/pages/1', {
      exact: true,
    }),
  ).toBeVisible();

  const downloadDone = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Export log' }).click();
  const exported = await readFile(await (await downloadDone).path(), 'utf8');

  expect(exported).toContain('https://api.mangadex.org/manga');
  expect(exported).toContain('https://x.test/pages/1');
  for (const secret of [
    's3cret',
    'abc.def',
    'hunter2',
    'api_key=zzz',
    'limit=10',
    ...SEEDED_FRAGMENTS,
  ]) {
    expect(exported).not.toContain(secret);
  }

  // The seeded values never reached the DOM either, only their redacted forms.
  const html = await page.content();
  for (const secret of ['s3cret', 'abc.def', 'hunter2', 'api_key=zzz', ...SEEDED_FRAGMENTS]) {
    expect(html).not.toContain(secret);
  }

  // Clear waits for the real cross-tab lock: another tab is holding it here.
  await section.getByRole('button', { name: 'Clear log' }).evaluate(
    async (button: HTMLElement, { key, lockName }) => {
      const stillStored = await navigator.locks.request(lockName, async () => {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        return localStorage.getItem(key) !== null;
      });
      if (!stillStored) throw new Error('Clear did not wait for the event log lock');
    },
    { key: EVENT_LOG_KEY, lockName: EVENT_LOG_LOCK },
  );
  await expect(panel('Reader timing').getByText('No events recorded.')).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), EVENT_LOG_KEY))
    .toBeNull();

  expect(outbound).toEqual([]);
});
