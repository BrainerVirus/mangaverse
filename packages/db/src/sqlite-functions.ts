import { foldTitleForSearch, foldTitleForSort } from './title-fold.js';

/** Search uses lowercase only; sort uses the accent-folded primary form. */
export const TITLE_SEARCH_SQL_FUNCTION = 'mv_search_text';
export const TITLE_SORT_SQL_FUNCTION = 'mv_sort_text';

type SqlValue = string | number | null | undefined;
type Fold = (value: SqlValue) => string | null;

/** A memoized fold: a page folds the same titles many times, and folding is pure. */
function memoized(fold: (value: string) => string): Fold {
  const cache = new Map<string, string>();
  return (value) => {
    if (value === null || value === undefined) return null;
    const text = String(value);
    const cached = cache.get(text);
    if (cached !== undefined) return cached;
    const folded = fold(text);
    cache.set(text, folded);
    // A library has thousands of titles, not millions; cap the cache anyway so a long
    // session that keeps importing cannot grow it without bound.
    if (cache.size > 10_000) cache.delete(cache.keys().next().value as string);
    return folded;
  };
}

export function createTitleFolds(): Record<string, Fold> {
  return {
    [TITLE_SEARCH_SQL_FUNCTION]: memoized(foldTitleForSearch),
    [TITLE_SORT_SQL_FUNCTION]: memoized(foldTitleForSort),
  };
}
