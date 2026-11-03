/**
 * Title comparison text, in two forms:
 *
 * - search keeps the old library matcher's semantics: `toLowerCase()` on both sides, so
 *   "ÉCLAIR" and "é" find "Éclair", while a plain "e" does not turn into an accent match.
 * - sort folds further to a primary form: combining marks stripped after NFD, so "ä" ranks
 *   with "a" instead of after "z" (BINARY collation's order).
 *
 * SQLite has no ICU, so both run in JavaScript and are registered on every driver as the
 * `mv_search_text` and `mv_sort_text` SQL functions (see `sqlite-functions.ts`).
 */
export function foldTitleForSearch(value: string): string {
  return value.toLowerCase();
}

export function foldTitleForSort(value: string): string {
  // Most titles are ASCII; skip Unicode normalization then. A regex test is far cheaper
  // than NFD plus a mark-strip pass on every row of a 5,000-title sort.
  if (!/[\u0080-\uFFFF]/.test(value)) return value.toLowerCase();
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}
