import type {
  ReaderSessionInput,
  PageSlot,
  SpreadLayout,
} from './types.js';

function canPairWithLeft(leftPage: { image: { width?: number; height?: number } }, rightPage: { image: { width?: number; height?: number } }): boolean {
  const leftW = leftPage.image.width;
  const leftH = leftPage.image.height;
  const rightW = rightPage.image.width;
  const rightH = rightPage.image.height;

  if (leftW === undefined || leftH === undefined || rightW === undefined || rightH === undefined) {
    return false;
  }

  const leftIsPortrait = leftH > leftW;
  const rightIsPortrait = rightH > rightW;

  return leftIsPortrait && rightIsPortrait;
}

export function calculatePageSlots(input: ReaderSessionInput): readonly PageSlot[] {
  const { chapter, settings } = input;
  const { pageLayout, readingMode, treatFirstPageAsCover } = settings;
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
    return pages.map((_, index) => ({
      pageIndex: index,
      isCover: false,
      isLeftPage: index % 2 === 0,
      isRightPage: index % 2 === 1,
    }));
  }

  // double or smartSpread
  if (pageLayout === 'double') {
    return buildDoubleSlots(pages, treatFirstPageAsCover, readingMode);
  }

  // smartSpread - dimension-aware pairing
  return buildSmartSpreadSlots(pages, treatFirstPageAsCover, readingMode);
}

function buildDoubleSlots(
  pages: readonly { id: string; index: number; image: { url: string } }[],
  treatFirstPageAsCover: boolean,
  readingMode: 'rtl' | 'ltr' | 'vertical'
): readonly PageSlot[] {
  const slots: PageSlot[] = [];

  if (treatFirstPageAsCover && pages.length > 0) {
    slots.push({
      pageIndex: 0,
      isCover: true,
      isLeftPage: false,
      isRightPage: false,
    });

    let i = 1;
    while (i < pages.length) {
      if (i % 2 === 1) {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: true,
          isRightPage: false,
        });
        if (i + 1 < pages.length) {
          slots.push({
            pageIndex: i + 1,
            isCover: false,
            isLeftPage: false,
            isRightPage: true,
          });
        }
        i += 2;
      } else {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: false,
          isRightPage: false,
        });
        i++;
      }
    }
  } else {
    // No cover: mechanical pairing - pairs pages by index without dimension checks
    let i = 0;
    while (i < pages.length) {
      const isLeftSlot = slots.length % 2 === 0;

      if (isLeftSlot) {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: true,
          isRightPage: false,
        });
        if (i + 1 < pages.length) {
          slots.push({
            pageIndex: i + 1,
            isCover: false,
            isLeftPage: false,
            isRightPage: true,
          });
        }
        i += 2;
      } else {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: false,
          isRightPage: false,
        });
        i += 1;
      }
    }
  }

  if (readingMode === 'rtl') {
    return slots.map(slot => ({
      ...slot,
      isLeftPage: slot.isRightPage,
      isRightPage: slot.isLeftPage,
    }));
  }

  return slots;
}

function buildSmartSpreadSlots(
  pages: readonly { id: string; index: number; image: { url: string; width?: number; height?: number } }[],
  treatFirstPageAsCover: boolean,
  readingMode: 'rtl' | 'ltr' | 'vertical'
): readonly PageSlot[] {
  const slots: PageSlot[] = [];

  if (treatFirstPageAsCover && pages.length > 0) {
    slots.push({
      pageIndex: 0,
      isCover: true,
      isLeftPage: false,
      isRightPage: false,
    });

    let i = 1;
    while (i < pages.length) {
      const leftPage = pages[i];
      const rightPage = pages[i + 1];

      if (rightPage && leftPage && canPairWithLeft(leftPage, rightPage)) {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: true,
          isRightPage: false,
        });
        slots.push({
          pageIndex: i + 1,
          isCover: false,
          isLeftPage: false,
          isRightPage: true,
        });
        i += 2;
      } else {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: false,
          isRightPage: false,
        });
        i += 1;
      }
    }
  } else {
    let i = 0;
    while (i < pages.length) {
      const leftPage = pages[i];
      const rightPage = pages[i + 1];

      if (rightPage && leftPage && canPairWithLeft(leftPage, rightPage)) {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: true,
          isRightPage: false,
        });
        slots.push({
          pageIndex: i + 1,
          isCover: false,
          isLeftPage: false,
          isRightPage: true,
        });
        i += 2;
      } else {
        slots.push({
          pageIndex: i,
          isCover: false,
          isLeftPage: false,
          isRightPage: false,
        });
        i += 1;
      }
    }
  }

  if (readingMode === 'rtl') {
    return slots.map(slot => ({
      ...slot,
      isLeftPage: slot.isRightPage,
      isRightPage: slot.isLeftPage,
    }));
  }

  return slots;
}

export function calculateSpreadPlan(input: ReaderSessionInput): SpreadLayout {
  const slots = calculatePageSlots(input);
  const pageIndexes = slots.map(s => s.pageIndex);

  return {
    slots,
    pageIndexes,
    slotCount: slots.length,
  };
}

export function resolveInitialPageIndex(
  input: ReaderSessionInput,
  bookmarkPageIndex?: number
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