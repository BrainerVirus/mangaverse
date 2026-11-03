/**
 * SQLite folds shared by both drivers (ADR 0001, decision 3).
 *
 * SQLite's `lower()` is ASCII-only, so a title like "Éclair" never matched "éclair"
 * and sorted after "Zebra". These functions run the same JavaScript folds the old
 * in-memory matcher used, registered per connection.
 */

/** Text matching: the old `toLowerCase().includes(...)` semantics, Unicode-aware. */
export const SQL_FOLD_MATCH = 'mv_fold_match';
/** Title ordering: case-insensitive and accent-insensitive, so "Éclair" sorts near "E". */
export const SQL_FOLD_SORT = 'mv_fold_sort';

export function foldForMatch(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

export function foldForSort(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** Registers both folds on a `sql.js` connection. Missing API is a programming error. */
export function registerSqlJsFolds(raw: {
  create_function?: (name: string, fn: (value: unknown) => string) => void;
}): void {
  const register = raw.create_function;
  if (register === undefined) throw new Error('sql.js create_function is unavailable');
  register.call(raw, SQL_FOLD_MATCH, foldForMatch);
  register.call(raw, SQL_FOLD_SORT, foldForSort);
}

/** Registers both folds on a `node:sqlite` connection. */
export function registerNodeSqliteFolds(database: {
  function: (name: string, fn: (value: unknown) => string) => void;
}): void {
  database.function(SQL_FOLD_MATCH, foldForMatch);
  database.function(SQL_FOLD_SORT, foldForSort);
}
