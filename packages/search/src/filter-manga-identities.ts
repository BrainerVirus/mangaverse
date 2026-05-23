import type { MangaIdentity } from '@app/shared';

export function filterMangaIdentitiesByQuery(
  identities: readonly MangaIdentity[],
  query: string,
): MangaIdentity[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...identities];
  }

  return identities.filter((manga) => {
    if (manga.canonicalTitle.toLowerCase().includes(normalized)) {
      return true;
    }
    return (
      manga.alternativeTitles?.some((title) => title.value.toLowerCase().includes(normalized)) ??
      false
    );
  });
}
