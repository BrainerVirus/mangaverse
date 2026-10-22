import { expect } from '@playwright/test';

import { test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const MANGA_PATH = '/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';
const TITLE = 'Kuro no Shoukanshi';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Given a library card over dark art, Then its title and source sit on a card-toned plate', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  // The seeded local identity is hydrated from the recorded provider detail.
  expect(mockMangaDex.count).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Add to library' }).click();
  await waitForPingQuiet(page);

  await page.goto('/library');
  const plate = page.locator('[data-card-plate]').first();
  await expect(plate).toBeVisible({ timeout: 20_000 });

  const paint = await plate.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { backgroundImage: styles.backgroundImage, color: styles.color };
  });
  expect(paint.backgroundImage).toContain('linear-gradient');
  // The plate is painted in the theme's own card token: white on the default light preset.
  expect(paint.backgroundImage).toContain('rgb(255, 255, 255)');

  const source = plate.locator('p');
  const sourcePaint = await source.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return { width: rect.width, height: rect.height, color: styles.color };
  });
  // The source line is readable: a laid-out box with an opaque, themed colour.
  expect(sourcePaint.width, JSON.stringify(sourcePaint)).toBeGreaterThan(0);
  expect(sourcePaint.height, JSON.stringify(sourcePaint)).toBeGreaterThan(0);
  expect(sourcePaint.color).not.toBe('rgba(0, 0, 0, 0)');
});

test('Given a library card, When it opens and Back is pressed, Then the library returns', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  // The seeded local identity is hydrated from the recorded provider detail.
  expect(mockMangaDex.count).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Add to library' }).click();
  await waitForPingQuiet(page);

  await page.goto('/library');
  const card = page.locator('[data-library-card] button').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/manga\//);

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 15_000 });
  await expect(page.locator('[data-library-card]')).toHaveCount(1);
});

test('Given unknown ids, Then each detail page names what is missing and offers a way back', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/manga/not-a-real-id');
  await expect(page.getByRole('heading', { name: 'Manga not found' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('No results found')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page).toHaveURL(/\/library/);

  await page.goto('/extensions/not-a-real-id');
  await expect(page.getByRole('heading', { name: 'Provider not found' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('No provider installed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to extensions' }).click();
  await expect(page).toHaveURL(/\/extensions(\?|$)/);
});

test('Given the theme gallery, Then each preview fills its column at 390 and 768', async ({
  page,
  quickOnboarding,
}) => {
  const measurePreviews = () =>
    page.locator('[data-theme-preview]').evaluateAll((elements) =>
      elements.slice(0, 2).map((element) => {
        const preview = element.getBoundingClientRect();
        const card = element.closest('button')?.getBoundingClientRect();
        return {
          width: preview.width,
          height: preview.height,
          cardWidth: card?.width ?? 0,
        };
      }),
    );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/theme');
  await expect(page.getByRole('heading', { name: 'Theme', level: 1 })).toBeVisible({
    timeout: 30_000,
  });

  const mobile = await measurePreviews();
  expect(mobile).toHaveLength(2);
  expect(mobile[0]!.cardWidth).toBeGreaterThan(0);
  // Full column: the preview keeps the card's inner width instead of shrinking to its label.
  expect(mobile[0]!.width, JSON.stringify(mobile)).toBeGreaterThan(mobile[0]!.cardWidth - 12);
  expect(mobile[0]!.width, JSON.stringify(mobile)).toBeGreaterThan(300);

  await page.setViewportSize({ width: 768, height: 900 });
  const tablet = await measurePreviews();
  expect(tablet[0]!.width, JSON.stringify(tablet)).toBeGreaterThan(tablet[0]!.cardWidth - 12);
  // Equal-height samples: side-by-side cards share one height.
  expect(Math.abs(tablet[0]!.height - tablet[1]!.height), JSON.stringify(tablet)).toBeLessThan(2);
  expect(Math.abs(tablet[0]!.width - tablet[1]!.width), JSON.stringify(tablet)).toBeLessThan(2);
});

test('Given reader settings and the theme editor, Then both sliders expose the shared visible track', async ({
  page,
  quickOnboarding,
}) => {
  const trackRule = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of [...rules]) {
        if (rule instanceof CSSStyleRule && rule.selectorText.includes('slider-track')) {
          found.push(rule.cssText);
        }
        if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        // Cross-origin sheets carry no app styles.
      }
    }
    return found.join('\n');
  });

  await page.goto('/settings/reader');
  const readerSlider = page.locator('input[type="range"]').first();
  await expect(readerSlider).toBeVisible({ timeout: 30_000 });
  await expect(readerSlider).toHaveClass(/slider-track/);
  const readerFill = await readerSlider.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--slider-fill'),
  );
  expect(readerFill.trim()).toMatch(/^\d+(\.\d+)?%$/);

  await page.goto('/theme/editor');
  const themeSlider = page.locator('input[type="range"]').first();
  await expect(themeSlider).toBeVisible({ timeout: 30_000 });
  await expect(themeSlider).toHaveClass(/slider-track/);

  expect(trackRule).toContain('::-webkit-slider-runnable-track');
  expect(trackRule).toContain('var(--ring)');
  expect(trackRule).toContain('var(--primary)');
});

test('Given the seeded MangaDex description, Then the detail page shows plain prose', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(MANGA_PATH);
  const description = page.getByText(/Character Designer/);
  await expect(description).toBeVisible({ timeout: 30_000 });

  const text = (await description.textContent()) ?? '';
  expect(text).not.toContain('**');
  expect(text).not.toContain('___');
  expect(text).not.toContain('](');
  expect(text).toContain('Character Designer: Kurogin (DIGS)');
  await expect(page.getByText('• Official English Light Novel')).toBeVisible();
  expect(mockMangaDex.count).toBeGreaterThan(0);
});
