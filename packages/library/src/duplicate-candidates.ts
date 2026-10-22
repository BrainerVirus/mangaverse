import type { AppDrizzleDb, IdentityMatchProfile } from '@app/db';
import { normalizeTitleForMatch, scoreTitleMatch, type MangaId } from '@app/shared';

export type DuplicateConfidence = 'low' | 'medium' | 'high';

export interface DuplicateCandidate {
  readonly mangaId: MangaId;
  readonly canonicalTitle: string;
  /** Provider sources on the candidate, for the review list. */
  readonly providerIds: readonly string[];
  /** 0..1; exact titles with matching people approach 1. */
  readonly score: number;
  readonly confidence: DuplicateConfidence;
  readonly matchedTitle: string;
}

export interface RankDuplicateOptions {
  /** Caps the visible list; the detail page shows a short review queue. */
  readonly limit?: number;
}

export const DUPLICATE_CANDIDATE_LIMIT = 5;
export const DUPLICATE_CANDIDATE_THRESHOLD = 0.6;

function normalizedSet(values: readonly string[]): Set<string> {
  return new Set(values.map(normalizeTitleForMatch).filter((value) => value.length > 0));
}

/** Shared names over the smaller set: one shared author is evidence even if the other lists more. */
function peopleOverlap(left: readonly string[], right: readonly string[]): number {
  const leftSet = normalizedSet(left);
  const rightSet = normalizedSet(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let shared = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) shared += 1;
  }
  return shared / Math.min(leftSet.size, rightSet.size);
}

export function duplicateConfidence(score: number): DuplicateConfidence {
  if (score >= 0.8) return 'high';
  if (score >= 0.65) return 'medium';
  return 'low';
}

/**
 * Local-only duplicate scoring: the best title pair carries 80%, author/artist
 * overlap the remaining 20%. No provider call is made; everything comes from
 * the identity rows already on the device.
 */
export function scoreDuplicateCandidate(
  target: IdentityMatchProfile,
  candidate: IdentityMatchProfile,
): { readonly score: number; readonly matchedTitle: string } {
  let titleScore = 0;
  let matchedTitle = candidate.canonicalTitle;
  for (const targetTitle of target.titles) {
    for (const candidateTitle of candidate.titles) {
      const score = scoreTitleMatch(targetTitle, candidateTitle);
      if (score > titleScore) {
        titleScore = score;
        matchedTitle = candidateTitle;
      }
    }
  }

  const peopleScore = Math.max(
    peopleOverlap(target.authors, candidate.authors),
    peopleOverlap(target.artists, candidate.artists),
  );
  return {
    score: Math.round((titleScore * 0.8 + peopleScore * 0.2) * 100) / 100,
    matchedTitle,
  };
}

export function rankDuplicateCandidates(
  target: IdentityMatchProfile,
  candidates: readonly IdentityMatchProfile[],
  options?: RankDuplicateOptions,
): DuplicateCandidate[] {
  const limit = options?.limit ?? DUPLICATE_CANDIDATE_LIMIT;
  if (limit <= 0) return [];

  return candidates
    .filter(
      (candidate) =>
        candidate.mangaId !== target.mangaId &&
        !candidate.merged &&
        candidate.providerIds.length > 0,
    )
    .map((candidate) => {
      const scored = scoreDuplicateCandidate(target, candidate);
      return {
        mangaId: candidate.mangaId,
        canonicalTitle: candidate.canonicalTitle,
        providerIds: candidate.providerIds,
        score: scored.score,
        confidence: duplicateConfidence(scored.score),
        matchedTitle: scored.matchedTitle,
      };
    })
    .filter((candidate) => candidate.score >= DUPLICATE_CANDIDATE_THRESHOLD)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.canonicalTitle.localeCompare(b.canonicalTitle) ||
        a.mangaId.localeCompare(b.mangaId),
    )
    .slice(0, limit);
}

/** Candidate list for one title; returns [] when the title has no local profile. */
export async function findDuplicateCandidates(
  db: AppDrizzleDb,
  mangaId: MangaId,
  options?: RankDuplicateOptions,
): Promise<DuplicateCandidate[]> {
  const { listIdentityMatchProfiles } = await import('@app/db');
  const profiles = await listIdentityMatchProfiles(db);
  const target = profiles.find((profile) => profile.mangaId === mangaId);
  if (target === undefined) return [];
  return rankDuplicateCandidates(target, profiles, options);
}
