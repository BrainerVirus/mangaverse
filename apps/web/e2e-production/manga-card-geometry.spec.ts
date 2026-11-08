import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

import { fixturesDir, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

const SEARCH_FIXTURE = JSON.parse(readFileSync(`${fixturesDir}/search.json`, 'utf8')) as {
  data: { id: string; attributes: Record<string, unknown> }[];
};
const MANGA_PATH = '/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';

// Windows scales the desktop build by 125% and 150%: the fractional device pixel is what
// exposes a cover painted against a border. 390 is the phone width, 1440 the desktop one.
const RUNS = [
  { width: 390, dpr: 1.5 },
  { width: 1440, dpr: 1.25 },
] as const;

/** A saturated orange cover: any pixel of it outside the cover itself is visible against the card. */
function orangePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([255, 100, 0], 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Six titles, so the grid has neighbours in the same row and in the row below. */
async function stubCovers(page: Page): Promise<void> {
  await page.route('**/uploads.mangadex.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: orangePng(256, 384) }),
  );
  await page.route(/api\.mangadex\.org\/manga\?/, (route) => {
    const base = SEARCH_FIXTURE.data[0]!;
    const data = Array.from({ length: 6 }, (_, index) => ({
      ...base,
      id: `dc332d04-d3b0-413c-a767-70f5e451b0${String(index).padStart(2, '0')}`,
      attributes: {
        ...base.attributes,
        title: { en: `Geometry Title ${index + 1} with a long wrapping name` },
      },
    }));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...SEARCH_FIXTURE, data, total: data.length }),
    });
  });
}

interface Boxes {
  /** x, y, width, height of every matching element, then its offsetWidth and offsetHeight. */
  readonly boxes: readonly (readonly number[])[];
  readonly transforms: readonly string[];
  readonly boxShadows: readonly string[];
}

/** Every element's box and transform: a card or a neighbour that moves shows up here. */
async function measure(locator: Locator, extra?: Locator): Promise<Boxes> {
  const read = (elements: Element[]) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const html = element as HTMLElement;
      return {
        box: [rect.x, rect.y, rect.width, rect.height, html.offsetWidth, html.offsetHeight],
        transform: getComputedStyle(element).transform,
        shadow: getComputedStyle(element).boxShadow,
      };
    });
  const rows = await locator.evaluateAll(read);
  const more = extra ? await extra.evaluateAll(read) : [];
  const all = [...rows, ...more];
  return {
    boxes: all.map((row) => row.box),
    transforms: all.map((row) => row.transform),
    boxShadows: all.map((row) => row.shadow),
  };
}

function expectSameBoxes(actual: Boxes, expected: Boxes, label: string): void {
  expect(actual.boxes.length, `${label}: same elements`).toBe(expected.boxes.length);
  actual.boxes.forEach((box, index) => {
    box.forEach((value, axis) => {
      // GSAP's lift moved the card by 2px and grew it by 1.02x: anything under 0.01px is rounding.
      expect(
        Math.abs(value - (expected.boxes[index]?.[axis] ?? Number.NaN)),
        `${label}: element ${index} box[${axis}]`,
      ).toBeLessThan(0.01);
    });
  });
  for (const transform of actual.transforms) {
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)'], `${label}: transform`).toContain(transform);
  }
}

interface Leaks {
  /** Tinted pixels in the first three device pixels inside the box, mid-edge on every side. */
  readonly edges: number;
  /** Tinted pixels in the bottom 8 css px of the card, corners included. */
  readonly bottom: number;
}

/**
 * Screenshots the card and counts pixels that carry the cover's colour where only the page,
 * the border and the card's own fill belong: the border ring and the title plate's bottom.
 */
async function leaks(page: Page, card: Locator, grid: boolean): Promise<Leaks> {
  const box = (await card.boundingBox())!;
  const margin = 8;
  const clip = {
    x: Math.floor(box.x) - margin,
    y: Math.floor(box.y) - margin,
    width: Math.ceil(box.width) + 2 * margin,
    height: Math.ceil(box.height) + 2 * margin,
  };
  const png = await page.screenshot({ clip });
  return page.evaluate(
    async ({ base64, rect, origin, bottomRows }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const dpr = window.devicePixelRatio;
      const tinted = (x: number, y: number): boolean => {
        const offset = (y * canvas.width + x) * 4;
        const channels = [data[offset]!, data[offset + 1]!, data[offset + 2]!];
        return Math.max(...channels) - Math.min(...channels) > 28;
      };
      const x0 = Math.round((rect.x - origin.x) * dpr);
      const y0 = Math.round((rect.y - origin.y) * dpr);
      const x1 = Math.round((rect.x + rect.width - origin.x) * dpr);
      const y1 = Math.round((rect.y + rect.height - origin.y) * dpr);
      const midX = Math.round((x0 + x1) / 2);
      const midY = Math.round(y0 + (y1 - y0) * 0.4);
      let edges = 0;
      for (let depth = 0; depth < 3; depth += 1) {
        if (tinted(x0 + depth, midY)) edges += 1;
        if (tinted(x1 - 1 - depth, midY)) edges += 1;
        if (tinted(midX, y0 + depth)) edges += 1;
        if (tinted(midX, y1 - 1 - depth)) edges += 1;
      }
      let bottom = 0;
      for (let y = y1 - Math.round(8 * dpr); bottomRows && y < y1; y += 1)
        for (let x = x0; x < x1; x += 1) if (tinted(x, y)) bottom += 1;
      return { edges, bottom };
    },
    { base64: png.toString('base64'), rect: box, origin: clip, bottomRows: grid },
  );
}

async function keyboardFocus(page: Page, card: Locator): Promise<void> {
  await page.mouse.move(1, 1);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  for (let press = 0; press < 80; press += 1) {
    await page.keyboard.press('Tab');
    if (await card.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Tab never reached the card');
}

async function attach(testInfo: TestInfo, page: Page, card: Locator, name: string): Promise<void> {
  const box = (await card.boundingBox())!;
  const body = await page.screenshot({
    clip: {
      x: Math.max(0, Math.floor(box.x) - 12),
      y: Math.max(0, Math.floor(box.y) - 12),
      width: Math.ceil(box.width) + 24,
      height: Math.ceil(box.height) + 24,
    },
  });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

function expectNoLeak(found: Leaks, label: string): void {
  expect(found.edges, `${label}: cover colour in the border ring`).toBe(0);
  expect(found.bottom, `${label}: cover colour on the bottom edge`).toBe(0);
}

/**
 * Rest, hover and keyboard focus of one card: nothing moves or resizes (the card nor any
 * neighbour), hover still changes the card's look, focus still draws the ring, and no cover
 * colour reaches the border or the bottom edge.
 */
async function expectCalmCard(
  page: Page,
  testInfo: TestInfo,
  cards: Locator,
  index: number,
  label: string,
  grid: boolean,
  extra?: Locator,
): Promise<void> {
  const card = cards.nth(index);
  await card.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  const rest = await measure(cards, extra);
  expectNoLeak(await leaks(page, card, grid), `${label} rest`);
  await attach(testInfo, page, card, `${label}-rest`);

  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => card.evaluate((element) => element.matches(':hover'))).toBe(true);
  // Longer than any lift tween (DURATION.quick, 140ms) plus the colour transition.
  await page.waitForTimeout(500);
  const hover = await measure(cards, extra);
  expectNoLeak(await leaks(page, card, grid), `${label} hover`);
  await attach(testInfo, page, card, `${label}-hover`);
  expectSameBoxes(hover, rest, `${label} hover`);
  expect(hover.boxShadows[index], `${label}: hover still elevates the card`).not.toBe(
    rest.boxShadows[index],
  );

  await keyboardFocus(page, card);
  await expect.poll(() => card.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  await page.waitForTimeout(300);
  const focus = await measure(cards, extra);
  expectNoLeak(await leaks(page, card, grid), `${label} focus`);
  await attach(testInfo, page, card, `${label}-focus`);
  expectSameBoxes(focus, rest, `${label} focus`);
  expect(focus.boxShadows[index], `${label}: focus draws the ring`).not.toBe(
    rest.boxShadows[index],
  );
}

for (const run of RUNS) {
  test.describe(`${run.width}px at ${run.dpr}x`, () => {
    test.use({ deviceScaleFactor: run.dpr });

    test('Given search results with neighbours, When a grid card is hovered or focused, Then no card moves and no cover colour leaks', async ({
      page,
      quickOnboarding,
      mockMangaDex,
    }, testInfo) => {
      await stubCovers(page);
      await page.setViewportSize({ width: run.width, height: 900 });
      await page.goto('/search');
      const searchbox = page.getByRole('searchbox', { name: 'Search manga' });
      await expect(searchbox).toBeVisible({ timeout: 30_000 });
      const cards = page.getByRole('button', { name: /Geometry Title/ });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await searchbox.fill('berserk');
        try {
          await expect(cards).toHaveCount(6, { timeout: 6_000 });
          break;
        } catch {
          await searchbox.fill('');
        }
      }
      await expect(cards).toHaveCount(6);
      // The cover has to be on screen: a blank placeholder would hide every leak.
      await expect
        .poll(() =>
          cards
            .first()
            .locator('img')
            .evaluate((img: HTMLImageElement) => img.complete),
        )
        .toBe(true);
      await page.waitForTimeout(500);

      // One card in the first row and one in the second, each with neighbours on every side.
      await expectCalmCard(page, testInfo, cards, 1, 'search-first-row', true);
      await expectCalmCard(page, testInfo, cards, 4, 'search-second-row', true);
    });

    test('Given a saved title, When its grid, list and compact cards are hovered or focused, Then the card and the line under it stay put', async ({
      page,
      quickOnboarding,
      mockMangaDex,
    }, testInfo) => {
      await stubCovers(page);
      await page.setViewportSize({ width: run.width, height: 900 });
      await page.goto(MANGA_PATH);
      const addToLibrary = page.getByRole('button', { name: 'Add to library' });
      await expect(addToLibrary).toBeVisible({ timeout: 30_000 });
      await addToLibrary.click();
      await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible();
      await waitForPingQuiet(page);

      await page.goto('/library');
      const cards = page.locator('[data-library-card] button');
      await expect(cards.first()).toBeVisible({ timeout: 20_000 });
      const meta = page.locator('[data-library-card-meta]');
      // The saved title carries a content rating above safe: its badge sits on the cover's corner.
      await expect(page.getByText('Suggestive')).toBeVisible();

      for (const layout of ['Grid', 'List', 'Compact'] as const) {
        await page.getByRole('button', { name: layout, exact: true }).click();
        await expect(page.getByRole('button', { name: layout, exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await page.waitForTimeout(400);
        await expectCalmCard(
          page,
          testInfo,
          cards,
          0,
          `library-${layout}`,
          layout === 'Grid',
          meta,
        );
      }
    });
  });
}
