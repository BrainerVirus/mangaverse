import type { ReaderPage, ReaderSessionInput, PageSlot, SpreadLayout } from './types.js';

type SpreadPage = Pick<ReaderPage, 'image' | 'width' | 'height'>;

function canPairWithLeft(leftPage: SpreadPage, rightPage: SpreadPage): boolean {
  const leftW = leftPage.image.width ?? leftPage.width;
  const leftH = leftPage.image.height ?? leftPage.height;
  const rightW = rightPage.image.width ?? rightPage.width;
  const rightH = rightPage.image.height ?? rightPage.height;

  if (leftW === undefined || leftH === undefined || rightW === undefined || rightH === undefined) {
    return false;
  }

  const leftIsPortrait = leftH > leftW;
  const rightIsPortrait = rightH > rightW;

  return leftIsPortrait && rightIsPortrait;
}

/**
 * A page whose known shape is landscape. A page without reported dimensions is
 * never wide, so it keeps the layout's ordinary pairing.
 */
export function isWidePage(page: SpreadPage): boolean {
  const width = page.image.width ?? page.width;
  const height = page.image.height ?? page.height;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return false;
  return width > height;
}

export function calculatePageSlots(input: ReaderSessionInput): readonly PageSlot[] {
  const { chapter, settings } = input;
  const { pageLayout, readingMode } = settings;
  const pages = chapter.pages;

  if (readingMode === 'vertical') {
    return pages.map((_page, index) => ({
      pageIndex: index,
      isCover: false,
      isLeftPage: false,
      isRightPage: false,
    }));
  }

  if (pageLayout === 'single') {
    // Deliberately NOT marked as left/right pages: the spread pairing in
    // findActiveSpreadSlots would otherwise pair every single-mode page with its
    // neighbour and render a two-page spread, making the Single/Double switch
    // look inert.
    return pages.map((_, index) => ({
      pageIndex: index,
      isCover: false,
      isLeftPage: false,
      isRightPage: false,
    }));
  }

  // double pairs mechanically; smartSpread pairs only two known portrait pages.
  return buildSpreadSlots(pages, {
    treatFirstPageAsCover: settings.treatFirstPageAsCover,
    split: settings.widePageMode === 'split',
    rtl: readingMode === 'rtl',
    canPair: pageLayout === 'double' ? () => true : canPairWithLeft,
  });
}

function standaloneSlot(pageIndex: number, isCover: boolean): PageSlot {
  return { pageIndex, isCover, isLeftPage: false, isRightPage: false };
}

/**
 * A wide page takes a spread of its own. Split, it fills the spread as its two
 * physical halves, left then right, in either reading direction.
 */
function wideSlots(pageIndex: number, isCover: boolean, split: boolean): readonly PageSlot[] {
  if (!split) return [standaloneSlot(pageIndex, isCover)];
  return [
    { pageIndex, isCover, isLeftPage: true, isRightPage: false, split: 'left' },
    { pageIndex, isCover, isLeftPage: false, isRightPage: true, split: 'right' },
  ];
}

/**
 * Walks the chapter in reading order. A pair's first page is marked left and
 * its second right, then RTL swaps the sides so the flags are physical. A wide
 * page (and the page before it, left without a partner) stands alone, so the
 * page after a wide one always opens a new spread on the reading-order side.
 */
function buildSpreadSlots(
  pages: readonly SpreadPage[],
  options: {
    readonly treatFirstPageAsCover: boolean;
    readonly split: boolean;
    readonly rtl: boolean;
    readonly canPair: (first: SpreadPage, second: SpreadPage) => boolean;
  },
): readonly PageSlot[] {
  const slots: PageSlot[] = [];
  let i = 0;
  while (i < pages.length) {
    const page = pages[i]!;
    const isCover = i === 0 && options.treatFirstPageAsCover;
    if (isWidePage(page)) {
      slots.push(...wideSlots(i, isCover, options.split));
      i += 1;
      continue;
    }
    const next = pages[i + 1];
    if (isCover || next === undefined || isWidePage(next) || !options.canPair(page, next)) {
      slots.push(standaloneSlot(i, isCover));
      i += 1;
      continue;
    }
    slots.push(
      { pageIndex: i, isCover: false, isLeftPage: true, isRightPage: false },
      { pageIndex: i + 1, isCover: false, isLeftPage: false, isRightPage: true },
    );
    i += 2;
  }

  if (!options.rtl) return slots;
  return slots.map((slot) =>
    slot.split === undefined
      ? { ...slot, isLeftPage: slot.isRightPage, isRightPage: slot.isLeftPage }
      : slot,
  );
}

export function calculateSpreadPlan(input: ReaderSessionInput): SpreadLayout {
  const slots = calculatePageSlots(input);
  const pageIndexes = slots.map((s) => s.pageIndex);

  return {
    slots,
    pageIndexes,
    slotCount: slots.length,
  };
}

export function resolveInitialPageIndex(
  input: ReaderSessionInput,
  bookmarkPageIndex?: number,
): number {
  const { chapter, settings } = input;
  const { treatFirstPageAsCover } = settings;
  const pageCount = chapter.pageCount;

  if (bookmarkPageIndex !== undefined && bookmarkPageIndex >= 0) {
    if (bookmarkPageIndex < pageCount) {
      if (treatFirstPageAsCover && bookmarkPageIndex === 0 && pageCount > 1) {
        return 1;
      }
      return bookmarkPageIndex;
    }
    return pageCount - 1;
  }

  if (treatFirstPageAsCover && pageCount > 1) {
    return 1;
  }

  return 0;
}
