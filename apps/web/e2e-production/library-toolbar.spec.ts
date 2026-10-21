import { expect, type Page } from '@playwright/test';

import { test, waitForPingQuiet } from './helpers.js';

const MANGA_PATH = '/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';

// Chromium cannot report env(safe-area-inset-*) from a desktop viewport, so the
// 44 px left/right hardware insets from the report are emulated on the shell.
// Re-applied on every navigation and kept for the desktop checks as a worst case.
const SAFE_AREA_44 = '[data-app-shell]{padding-inline:44px}';

interface ToolbarGeometry {
  viewport: { width: number; height: number };
  containerType: string;
  rowDirection: string;
  headerWidth: number;
  docOverflow: number;
  mainOverflow: number;
  cards: number;
  compact: { left: number; right: number; top: number; bottom: number };
  actionsTop: number;
  titleColumnBottom: number;
  scrollTop: number;
  windowScroll: number;
  shellPaddingInline: string;
}

async function measureToolbar(page: Page): Promise<ToolbarGeometry> {
  return page.evaluate(() => {
    const header = document.querySelector('[data-page-header]') as HTMLElement;
    const row = header.firstElementChild as HTMLElement;
    const compact = document.querySelector(
      'fieldset[aria-label="Library layout"] button[aria-label="Compact"]',
    ) as HTMLElement;
    const actions = compact.parentElement?.parentElement as HTMLElement;
    const main = document.querySelector('main') as HTMLElement;
    const compactRect = compact.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      containerType: getComputedStyle(header).containerType,
      rowDirection: getComputedStyle(row).flexDirection,
      headerWidth: header.getBoundingClientRect().width,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mainOverflow: main.scrollWidth - main.clientWidth,
      cards: document.querySelectorAll('[data-library-card]').length,
      compact: {
        left: compactRect.left,
        right: compactRect.right,
        top: compactRect.top,
        bottom: compactRect.bottom,
      },
      actionsTop: actions.getBoundingClientRect().top,
      titleColumnBottom: row.firstElementChild?.getBoundingClientRect().bottom ?? 0,
      scrollTop: main.scrollTop,
      windowScroll: window.scrollY,
      shellPaddingInline: getComputedStyle(
        document.querySelector('[data-app-shell]') as HTMLElement,
      ).paddingInline,
    };
  });
}

function expectNoClipping(geometry: ToolbarGeometry): void {
  // The compiled stylesheet must carry the header container, not just the markup.
  expect(geometry.containerType).toBe('inline-size');
  expect(geometry.shellPaddingInline).toBe('44px');
  expect(geometry.windowScroll).toBe(0);
  expect(geometry.scrollTop).toBe(0);
  expect(geometry.docOverflow).toBeLessThanOrEqual(0);
  expect(geometry.mainOverflow).toBeLessThanOrEqual(0);
  expect(geometry.cards).toBeGreaterThan(0);
  expect(geometry.compact.left).toBeGreaterThanOrEqual(0);
  expect(geometry.compact.right).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.compact.top).toBeGreaterThanOrEqual(0);
  expect(geometry.compact.bottom).toBeLessThanOrEqual(geometry.viewport.height);
}

test.describe.configure({ timeout: 120_000 });

test('Given a populated library, When the content column is narrow, Then the header wraps and Compact stays reachable', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 844, height: 390 });

  await page.goto(MANGA_PATH);
  const addToLibrary = page.getByRole('button', { name: 'Add to library' });
  await expect(addToLibrary).toBeVisible({ timeout: 30_000 });
  await addToLibrary.click();
  await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible();
  await waitForPingQuiet(page);

  await page.goto('/library');
  // The safe-area emulation is per document, so it follows the last navigation.
  await page.addStyleTag({ content: SAFE_AREA_44, id: 'e2e-safe-area-44' });
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });

  // 844×390 with 44 px side insets and the expanded rail leaves a 472 px column:
  // the viewport is past `sm:` but the header container must stack the actions.
  const narrow = await measureToolbar(page);
  expectNoClipping(narrow);
  expect(narrow.headerWidth).toBeLessThan(576);
  expect(narrow.rowDirection).toBe('column');
  expect(narrow.actionsTop).toBeGreaterThanOrEqual(narrow.titleColumnBottom - 1);

  const compact = page.getByRole('button', { name: 'Compact' });
  await compact.click();
  await expect(compact).toHaveAttribute('aria-pressed', 'true');

  // Collapse from a tall viewport: at 390 px height the rail's own bottom
  // actions are already off-screen, so clicking them there would scroll the
  // document instead of exercising the header.
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.mouse.move(600, 500);
  await expect(page.locator('aside')).toHaveCSS('width', '52px');

  // The collapsed rail widens the same 844×390 viewport back into a row;
  // wrapping may move the actions, but nothing may clip.
  await page.setViewportSize({ width: 844, height: 390 });
  const collapsed = await measureToolbar(page);
  expectNoClipping(collapsed);
  expect(collapsed.headerWidth).toBeGreaterThanOrEqual(576);
  expect(collapsed.rowDirection).toBe('row');

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.mouse.move(600, 500);
  await expect(page.locator('aside')).toHaveCSS('width', '220px');

  // RTL keeps the same container contract and leaves Compact clickable.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Grid' }).click();
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
  });
  const rtl = await measureToolbar(page);
  expectNoClipping(rtl);
  expect(rtl.rowDirection).toBe('column');
  await page.getByRole('button', { name: 'Compact' }).click();
  await expect(page.getByRole('button', { name: 'Compact' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.evaluate(() => {
    document.documentElement.dir = 'ltr';
  });

  // The earlier geometry sweep: tablet, phone, small and large desktop.
  for (const [width, height] of [
    [768, 1024],
    [390, 844],
    [1024, 768],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    expectNoClipping(await measureToolbar(page));
  }

  // A wide viewport with a narrow main column is exactly the case a viewport
  // breakpoint misses: the container query has to stack the actions.
  const wide = await measureToolbar(page);
  expect(wide.rowDirection).toBe('row');
  expect(wide.actionsTop).toBeLessThan(wide.titleColumnBottom);

  const clamp = await page.addStyleTag({ content: 'main{max-width:480px}' });
  const clamped = await measureToolbar(page);
  expect(clamped.viewport.width).toBe(1440);
  expect(clamped.headerWidth).toBeLessThan(576);
  expect(clamped.rowDirection).toBe('column');
  expect(clamped.actionsTop).toBeGreaterThanOrEqual(clamped.titleColumnBottom - 1);
  expectNoClipping(clamped);
  await clamp.evaluate((node) => node.remove());
});
