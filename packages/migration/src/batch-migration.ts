import type { MigrationBatchSummary, MigrationCandidate, MigrationSearchResult } from './types.js';

/**
 * Titles carried by one migration hand-off. The ids travel in the URL, so the
 * limit keeps a full batch under the request-line size servers accept.
 * 150 UUIDs serialize to a 6,768-char `/migration?ids=...` URL (the router sends
 * one encoded JSON array), leaving ~1.4KB of the 8KB request line for `sources`.
 * Raising this needs the encoded-length test in the web route suite updated.
 */
export const MIGRATION_BATCH_LIMIT = 150;

/** Limits a source provider's candidates to the ids handed over from the library. */
export function filterMigrationCandidatesByIds(
  candidates: readonly MigrationCandidate[],
  mangaIds: readonly string[],
): MigrationCandidate[] {
  if (mangaIds.length === 0) return [...candidates];
  const requested = new Set(mangaIds);
  return candidates.filter((candidate) => requested.has(candidate.mangaId));
}

/** Requested ids with no migratable candidate under the selected source provider. */
export function findMissingMigrationMangaIds(
  candidates: readonly MigrationCandidate[],
  mangaIds: readonly string[],
): string[] {
  const available = new Set(candidates.map((candidate) => candidate.mangaId));
  return mangaIds.filter((mangaId) => !available.has(mangaId));
}

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
