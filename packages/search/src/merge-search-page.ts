import type { MangaIdentity } from '@app/shared';
import type { SearchPageData } from './types.js';

/**
 * Local results stay first; provider identities only fill titles the local or
 * provider list does not already contain (case-insensitive canonical title).
 */
function mergeSearchResults(
  local: readonly MangaIdentity[],
  provider: readonly MangaIdentity[],
): readonly MangaIdentity[] {
  if (provider.length === 0) return local;

  const seenTitles = new Set(local.map((item) => item.canonicalTitle.toLowerCase()));
  const merged = [...local];

  for (const item of provider) {
    const title = item.canonicalTitle.toLowerCase();
    if (seenTitles.has(title)) continue;
    seenTitles.add(title);
    merged.push(item);
  }

  return merged;
}

/**
 * Folds provider identities into an already-rendered local search page. Without
 * local data there is nothing to merge into, so the page stays undefined.
 */
export function mergeSearchPageData(
  local: SearchPageData | undefined,
  provider: readonly MangaIdentity[] | undefined,
): SearchPageData | undefined {
  if (local === undefined) return undefined;

  const results = mergeSearchResults(local.results, provider ?? []);
  return results === local.results ? local : { ...local, results };
}
