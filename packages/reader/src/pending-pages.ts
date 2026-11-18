import { toChapterPageId } from '@app/shared';
import { createReaderState } from './state.js';
import type { ReaderPage, ReaderSessionInput } from './types.js';

/**
 * Stand-in pages for a chapter whose pages have not arrived: the slot(s) the
 * same settings will show first, chosen by the session's own spread logic over
 * pages of unknown shape. A strip or a single layout shows one page; a spread
 * layout shows two unless the resume page is the cover. The loaded pages have
 * no shape either until they decode, so the boxes match.
 */
export function pendingVisiblePages(input: ReaderSessionInput): readonly ReaderPage[] {
  const initialPageIndex = Math.max(0, input.initialPageIndex ?? 0);
  // One page past the resume page, so a spread that opens on it has its partner.
  const pageCount = initialPageIndex + 2;
  const pages: readonly ReaderPage[] = Array.from({ length: pageCount }, (_value, index) => ({
    id: toChapterPageId(`pending-page-${index}`),
    index,
    image: { url: '' },
  }));
  const state = createReaderState({
    ...input,
    chapter: { ...input.chapter, pages, pageCount },
    initialPageIndex,
  });
  return state.visiblePageIndexes.map((index) => pages[index]).filter((page) => page !== undefined);
}
