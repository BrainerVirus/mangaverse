import type { LibraryItem } from './types.js';

export function filterLibraryItemsByQuery(
  items: readonly LibraryItem[],
  query: string,
): LibraryItem[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...items];
  }

  return items.filter(({ manga }) => {
    if (manga.canonicalTitle.toLowerCase().includes(normalized)) {
      return true;
    }
    return (
      manga.alternativeTitles?.some((title) => title.value.toLowerCase().includes(normalized)) ??
      false
    );
  });
}
