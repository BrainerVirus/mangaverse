/**
 * The page a placeholder stands in for: a quiet plate in the stage's ink
 * (`--stage-ink`, light or dark with the stage) with a hairline edge. The ink
 * sketch drawn over it is the motion; the plate itself never moves. It is
 * positioned, so the sketch can fill it.
 */
export const READER_PAGE_PLATE_CLASS =
  'relative rounded-control border border-stage-ink/15 bg-stage-ink/5';

/** What a placeholder sketches: the same page in the pending stage and once the pages land. */
export function pageSketchSeed(chapterId: string, pageIndex: number): string {
  return `${chapterId}:${pageIndex}`;
}
