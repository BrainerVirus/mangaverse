/**
 * Columns follow the width of the content column (container queries), at the breakpoints the
 * virtualized library and search grids use (640/768/1024/1280), so a placeholder row lands in
 * the same columns as the cards that replace it.
 */
export const CONTENT_GRID_CLASSES =
  'grid grid-cols-2 gap-4 @min-[640px]:grid-cols-3 @min-[768px]:grid-cols-4 @min-[1024px]:grid-cols-5 @min-[1280px]:grid-cols-6';

export const VIEWPORT_4_CLASSES = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4';

const ROW_CELL_VISIBILITY = [
  '',
  '',
  'hidden @min-[640px]:block',
  'hidden @min-[768px]:block',
  'hidden @min-[1024px]:block',
  'hidden @min-[1280px]:block',
] as const;

/**
 * The class of the nth cover in a single-row section that sits in a `@container` and uses
 * `CONTENT_GRID_CLASSES`: a cover is shown only once the row has a column for it, so the row
 * never wraps and never leaves a hole. The placeholder and the loaded row share it.
 */
export function contentRowCellClass(index: number): string {
  return ROW_CELL_VISIBILITY[index] ?? 'hidden';
}
