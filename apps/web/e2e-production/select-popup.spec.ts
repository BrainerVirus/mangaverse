import { mkdirSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from './helpers.js';

/**
 * Regression proof for the select popup fix: a popper list must be bounded by
 * the space left in the viewport and scroll inside that bound, instead of being
 * clipped to the trigger height by `select-anchor-size` + `overflow-hidden`.
 *
 * The Locale select on `/settings/app` has five options (168px of content),
 * enough for a 180px viewport to overflow; the last option ("Japanese") must
 * still be reachable, selectable, and keep the trigger width.
 */
const auditDir = process.env.SCROLLBAR_AUDIT_DIR;

async function capture(page: Page, name: string) {
  if (auditDir === undefined) return;
  mkdirSync(auditDir, { recursive: true });
  await page.screenshot({ path: `${auditDir}/${name}.png`, animations: 'disabled' });
}

test.describe('select popup', () => {
  test('Given a short viewport, Then the long option list scrolls inside the popup and the last option stays selectable', async ({
    page,
    quickOnboarding,
  }, testInfo) => {
    await page.setViewportSize({ width: 900, height: 180 });
    await page.goto('/settings/app');
    await expect(page.getByRole('heading', { name: 'App settings' })).toBeVisible({
      timeout: 20_000,
    });

    const trigger = page.getByRole('combobox', { name: 'Locale' });
    // Centre the trigger so the popup has less than the 168px content height
    // left below it even if the page is scrolled to its end; Playwright's
    // default minimal scroll can leave enough room for all five options and
    // hide the regression.
    await trigger.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();

    await trigger.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    // The open zoom-in scales the popup to 95%; measurements taken mid-animation
    // would report a 553px-wide list for a 582px trigger.
    await list.evaluate(async (element) => {
      const animations = element.parentElement?.getAnimations({ subtree: true }) ?? [];
      await Promise.all(animations.map((animation) => animation.finished));
    });

    const metrics = await list.evaluate((element) => {
      const popup = element.parentElement as HTMLElement;
      const positioner = popup.parentElement as HTMLElement;
      const listStyle = getComputedStyle(element);
      const popupStyle = getComputedStyle(popup);
      const positionerStyle = getComputedStyle(positioner);
      const listRect = element.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();
      const options = element.querySelectorAll<HTMLElement>('[role="option"]');
      const last = options[options.length - 1];
      const lastRect = last.getBoundingClientRect();

      return {
        optionCount: options.length,
        lastText: last.textContent,
        popupMaxHeight: popupStyle.maxHeight,
        popupOverflow: popupStyle.overflow,
        popupRect: { top: popupRect.top, bottom: popupRect.bottom, height: popupRect.height },
        positionerTop: positionerStyle.top,
        positionerTransform: positionerStyle.transform,
        availableHeight: positionerStyle.getPropertyValue('--available-height'),
        availableWidth: positionerStyle.getPropertyValue('--available-width'),
        anchorWidth: positionerStyle.getPropertyValue('--anchor-width'),
        listClassName: element.className,
        listOverflowY: listStyle.overflowY,
        listMinWidth: listStyle.minWidth,
        listWidth: listStyle.width,
        listRect: { top: listRect.top, bottom: listRect.bottom, width: listRect.width },
        listClientHeight: element.clientHeight,
        listScrollHeight: element.scrollHeight,
        lastRect: { top: lastRect.top, bottom: lastRect.bottom },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });

    await testInfo.attach('select-popup.json', {
      body: JSON.stringify({ metrics }, null, 2),
      contentType: 'application/json',
    });

    // The popup is capped by the viewport, not by a fixed 24rem and not by the
    // trigger height. The list scrolls when the content exceeds that cap.
    expect(metrics.optionCount).toBeGreaterThanOrEqual(5);
    expect(metrics.popupMaxHeight).not.toBe('none');
    expect(Number.parseFloat(metrics.popupMaxHeight)).toBeLessThanOrEqual(metrics.viewport.height);
    expect(metrics.popupRect.bottom).toBeLessThanOrEqual(metrics.viewport.height + 1);
    expect(metrics.listOverflowY).toBe('auto');
    expect(metrics.listScrollHeight).toBeGreaterThan(metrics.listClientHeight);

    // The popup keeps the trigger width; the selected item must not be clipped
    // sideways either.
    expect(metrics.listRect.width, JSON.stringify(metrics)).toBeCloseTo(triggerBox!.width, 0);
    expect(metrics.listMinWidth).toBe(`${triggerBox!.width}px`);

    await capture(page, 'select-180-open');

    // Scrolling to the end brings the last option inside the list's visible box.
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const scrollState = await list.evaluate((element) => {
      const options = element.querySelectorAll<HTMLElement>('[role="option"]');
      const last = options[options.length - 1];
      const listRect = element.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      return {
        scrollTop: element.scrollTop,
        maxScroll: element.scrollHeight - element.clientHeight,
        lastFullyVisible:
          lastRect.top >= listRect.top - 0.5 && lastRect.bottom <= listRect.bottom + 0.5,
      };
    });
    expect(scrollState.scrollTop).toBeGreaterThan(0);
    expect(scrollState.scrollTop).toBe(scrollState.maxScroll);
    expect(scrollState.lastFullyVisible).toBe(true);

    await capture(page, 'select-180-scrolled');

    // Keyboard navigation still reaches and selects the last option.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveText(/Japanese/);

    await testInfo.attach('select-popup-scroll.json', {
      body: JSON.stringify({ metrics, scrollState }, null, 2),
      contentType: 'application/json',
    });
  });
});
