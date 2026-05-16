import type {
  ReaderSessionInput,
  PageSlot,
  SpreadLayout,
} from './types.js';

export function calculatePageSlots(input: ReaderSessionInput): readonly PageSlot[] {
  const { chapter, settings } = input;
  const { pageLayout, readingMode, treatFirstPageAsCover } = settings;
  const pages = chapter.pages;

  if (readingMode === 'vertical') {
    return pages.map((page, index) => ({
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

  const slots: PageSlot[] = [];

  if (treatFirstPageAsCover && pages.length > 0) {
    slots.push({
      pageIndex: 0,
      isCover: true,
      isLeftPage: false,
      isRightPage: false,
    });

    for (let i = 1; i < pages.length; i += 2) {
      const leftIndex = i;
      const rightIndex = Math.min(i + 1, pages.length - 1);

      slots.push({
        pageIndex: leftIndex,
        isCover: false,
        isLeftPage: true,
        isRightPage: false,
      });

      if (rightIndex > leftIndex) {
        slots.push({
          pageIndex: rightIndex,
          isCover: false,
          isLeftPage: false,
          isRightPage: true,
        });
      }
    }
  } else {
    for (let i = 0; i < pages.length; i += 2) {
      const leftIndex = i;
      const rightIndex = Math.min(i + 1, pages.length - 1);

      slots.push({
        pageIndex: leftIndex,
        isCover: false,
        isLeftPage: true,
        isRightPage: false,
      });

      if (rightIndex > leftIndex) {
        slots.push({
          pageIndex: rightIndex,
          isCover: false,
          isLeftPage: false,
          isRightPage: true,
        });
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