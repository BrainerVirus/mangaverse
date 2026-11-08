import { mkdirSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from './helpers.js';

/**
 * The audit's computed proof: a Windows owner check still looks at the real
 * thin bar, but the recipe is theme-derived, so its computed value can be read
 * here at both widths. `--disable-features=OverlayScrollbar` makes Chromium
 * lay out classic bars on macOS too, so the gutter is measurable and the
 * screenshots can show the bar instead of only the page.
 */
test.use({
  launchOptions: { args: ['--disable-features=OverlayScrollbar'] },
});

const auditDir = process.env.SCROLLBAR_AUDIT_DIR;

async function capture(page: Page, name: string): Promise<void> {
  if (auditDir === undefined) return;
  // The route outlet fades with a GSAP inline style, which `animations:
  // 'disabled'` does not settle; wait it out so the audit shot is not mid-fade.
  await page.waitForTimeout(450);
  mkdirSync(auditDir, { recursive: true });
  await page.screenshot({ path: `${auditDir}/${name}.png`, animations: 'disabled' });
}

interface ScrollReport {
  mainScrolls: boolean;
  documentScrolls: boolean;
  gutter: string | null;
  scrollbarWidth: string;
  scrollbarColor: string;
  htmlScrollbarWidth: string;
  htmlScrollbarColor: string;
  mainClientWidth: number | null;
  horizontalOverflow: number;
}

async function readScrollReport(page: Page): Promise<ScrollReport> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main#main-content');
    const documentScroller = document.scrollingElement as HTMLElement;
    const scrolls = (element: HTMLElement) => element.scrollHeight - element.clientHeight > 1;
    const mainStyle = main === null ? null : getComputedStyle(main);
    const htmlStyle = getComputedStyle(document.documentElement);

    return {
      mainScrolls: main !== null && scrolls(main),
      documentScrolls: scrolls(documentScroller),
      gutter: mainStyle === null ? null : mainStyle.scrollbarGutter,
      scrollbarWidth: mainStyle === null ? '' : mainStyle.scrollbarWidth,
      scrollbarColor: mainStyle === null ? '' : mainStyle.scrollbarColor,
      htmlScrollbarWidth: htmlStyle.scrollbarWidth,
      htmlScrollbarColor: htmlStyle.scrollbarColor,
      mainClientWidth: main === null ? null : main.clientWidth,
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function scrollPageToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main#main-content');
    if (main !== null && main.scrollHeight > main.clientHeight) {
      main.scrollTop = main.scrollHeight;
    } else {
      window.scrollTo(0, document.body.scrollHeight);
    }
  });
  await page.waitForTimeout(150);
}

function expectThemedScrollbar(width: string, color: string): void {
  expect(width, 'the bar stays thin').toBe('thin');
  expect(color, 'the bar is painted from the theme, never auto').not.toBe('auto');
  // `scrollbar-color` resolves the `color-mix` to an actual colour space value.
  expect(color).toMatch(/color\(|oklab|rgba?\(/);
}

test.describe('themed scrollbars', () => {
  test('Given a long settings page on desktop, Then the page bar is thin, themed and gutter-stable', async ({
    page,
    quickOnboarding,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 20_000 });

    const report = await readScrollReport(page);
    expect(report.mainScrolls || report.documentScrolls, 'settings is long enough to scroll').toBe(
      true,
    );
    expectThemedScrollbar(report.htmlScrollbarWidth, report.htmlScrollbarColor);
    if (report.mainScrolls) {
      expectThemedScrollbar(report.scrollbarWidth, report.scrollbarColor);
    }
    expect(report.gutter, 'md+ reserves the page gutter').toBe('stable');
    expect(report.horizontalOverflow).toBeLessThanOrEqual(0);

    // Removing the page content must not move the content box: the reserved
    // gutter is what keeps a short page and a long page at one width.
    const before = report.mainClientWidth;
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('[data-page-container]');
      if (frame !== null) frame.style.display = 'none';
    });
    const after = await readScrollReport(page);
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('[data-page-container]');
      if (frame !== null) frame.style.display = '';
    });
    expect(
      after.mainClientWidth,
      `client width ${String(before)} → ${String(after.mainClientWidth)}`,
    ).toBe(before);

    // A nested panel inherits the same recipe (the palette list is max-h-80).
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(async () => {
      if (!(await palette.isVisible())) await page.keyboard.press('ControlOrMeta+k');
      await expect(palette).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    const list = palette.locator('ul').first();
    const nested = await list.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflowY: style.overflowY,
        width: style.scrollbarWidth,
        color: style.scrollbarColor,
      };
    });
    expect(nested.overflowY).toBe('auto');
    expectThemedScrollbar(nested.width, nested.color);
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);

    await capture(page, 'settings-1440-top');
    await scrollPageToBottom(page);
    await capture(page, 'settings-1440-bottom');

    // Toggling the real theme must repaint the bar: no fixed grey survives.
    const lightColor = report.htmlScrollbarColor;
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    const dark = await readScrollReport(page);
    expect(dark.htmlScrollbarColor, 'light and dark resolve different thumbs').not.toBe(lightColor);
    expectThemedScrollbar(dark.htmlScrollbarWidth, dark.htmlScrollbarColor);
    await capture(page, 'settings-1440-dark');

    await testInfo.attach('computed-1440.json', {
      body: JSON.stringify({ light: report, dark }, null, 2),
      contentType: 'application/json',
    });
  });

  test('Given a phone-width settings page, Then the bar is thin and themed without a reserved gutter', async ({
    page,
    quickOnboarding,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 20_000 });

    const report = await readScrollReport(page);
    expect(report.mainScrolls || report.documentScrolls, 'settings is long enough to scroll').toBe(
      true,
    );
    expectThemedScrollbar(report.htmlScrollbarWidth, report.htmlScrollbarColor);
    if (report.mainScrolls) {
      expectThemedScrollbar(report.scrollbarWidth, report.scrollbarColor);
    }
    // Below md the shell keeps the page scroll; a reserved gutter would eat
    // 10px of a 390px screen for nothing.
    expect(report.gutter).toBe('auto');
    expect(report.horizontalOverflow).toBeLessThanOrEqual(0);

    await capture(page, 'settings-390-top');
    await scrollPageToBottom(page);
    await capture(page, 'settings-390-bottom');

    await testInfo.attach('computed-390.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });
});
