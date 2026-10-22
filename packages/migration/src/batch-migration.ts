import type { MigrationBatchSummary, MigrationCandidate, MigrationSearchResult } from './types.js';

/**
 * Fills a target id for every matched, unblocked title that has none yet.
 * Explicit selections (including manual ids) are kept.
 */
export function selectAllMatched(input: {
  readonly candidates: readonly MigrationCandidate[];
  readonly resultsByMangaId: Readonly<Record<string, readonly MigrationSearchResult[]>>;
  readonly selections: Readonly<Record<string, string>>;
  readonly blockedMangaIds?: ReadonlySet<string>;
}): Record<string, string> {
  const next: Record<string, string> = { ...input.selections };

  for (const candidate of input.candidates) {
    if (input.blockedMangaIds?.has(candidate.mangaId) === true) continue;
    if ((next[candidate.mangaId] ?? '').trim().length > 0) continue;

    const best = input.resultsByMangaId[candidate.mangaId]?.[0];
    if (best !== undefined) {
      next[candidate.mangaId] = best.providerMangaId;
    }
  }

  return next;
}

export function summarizeMigrationBatch(input: {
  readonly candidates: readonly MigrationCandidate[];
  readonly selections: Readonly<Record<string, string>>;
  readonly resultsByMangaId: Readonly<Record<string, readonly MigrationSearchResult[]>>;
  readonly blockedMangaIds?: ReadonlySet<string>;
}): MigrationBatchSummary {
  let selectedCount = 0;
  let matchedCount = 0;
  let blockedCount = 0;

  for (const candidate of input.candidates) {
    if ((input.selections[candidate.mangaId] ?? '').trim().length > 0) selectedCount += 1;
    if ((input.resultsByMangaId[candidate.mangaId]?.length ?? 0) > 0) matchedCount += 1;
    if (input.blockedMangaIds?.has(candidate.mangaId) === true) blockedCount += 1;
  }

  return {
    totalCount: input.candidates.length,
    selectedCount,
    matchedCount,
    blockedCount,
  };
}
