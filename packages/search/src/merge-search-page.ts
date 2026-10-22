import type { MangaIdentity } from '@app/shared';

import { matchesSearchFilters, sortSearchResults } from './search-filters.js';
import type { SearchFilters, SearchPageData, SearchProviderResult } from './types.js';

function mappingKeys(identity: MangaIdentity): string[] {
  return identity.providerMappings.map(
    (mapping) => `${mapping.providerId}\u0000${mapping.providerMangaId}`,
  );
}

/**
 * Local results stay first; provider identities only fill titles or provider
 * mappings the merged list does not already contain. Identities keep their own
 * provider mappings, which the result cards use as attribution.
 */
function mergeSearchResults(
  local: readonly MangaIdentity[],
  provider: readonly MangaIdentity[],
): readonly MangaIdentity[] {
  if (provider.length === 0) return local;

  const seenTitles = new Set(local.map((item) => item.canonicalTitle.toLowerCase()));
  const seenMappings = new Set(local.flatMap(mappingKeys));
  const merged = [...local];

  for (const item of provider) {
    const title = item.canonicalTitle.toLowerCase();
    if (seenTitles.has(title) || mappingKeys(item).some((key) => seenMappings.has(key))) continue;
    seenTitles.add(title);
    for (const key of mappingKeys(item)) seenMappings.add(key);
    merged.push(item);
  }

  return merged;
}

export interface MergeSearchPageOptions {
  readonly filters?: SearchFilters | undefined;
  readonly explicitContent?: boolean | undefined;
}

/**
 * Folds provider identities into an already-rendered local search page. Without
 * local data there is nothing to merge into, so the page stays undefined.
 */
export function mergeSearchPageData(
  local: SearchPageData | undefined,
  providerResults: readonly SearchProviderResult[] = [],
  options: MergeSearchPageOptions = {},
): SearchPageData | undefined {
  if (local === undefined) return undefined;
  if (providerResults.length === 0 && (options.filters?.sort ?? 'relevance') === 'relevance') {
    return local;
  }

  const provider = providerResults.flatMap((group) =>
    group.results.filter((identity) =>
      matchesSearchFilters(identity, options.filters, options.explicitContent),
    ),
  );
  const results = sortSearchResults(
    mergeSearchResults(local.results, provider),
    options.filters?.sort,
  );
  return { ...local, results };
}
