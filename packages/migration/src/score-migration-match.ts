import type { MigrationSearchCandidate, MigrationSearchResult } from './types.js';

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeTitle(value).split(/\s+/).filter(Boolean));
}

export function scoreMigrationMatch(sourceTitle: string, candidateTitle: string): number {
  const source = normalizeTitle(sourceTitle);
  const candidate = normalizeTitle(candidateTitle);
  if (source.length === 0 || candidate.length === 0) return 0;
  if (source === candidate) return 1;

  if (candidate.includes(source) || source.includes(candidate)) {
    const shorter = Math.min(source.length, candidate.length);
    const longer = Math.max(source.length, candidate.length);
    return 0.75 + (shorter / longer) * 0.2;
  }

  const sourceTokens = tokenSet(sourceTitle);
  const candidateTokens = tokenSet(candidateTitle);
  if (sourceTokens.size === 0 || candidateTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(sourceTokens.size, candidateTokens.size);
}

export function rankMigrationSearchResults(
  sourceTitle: string,
  candidates: readonly MigrationSearchCandidate[],
): MigrationSearchResult[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      confidence: scoreMigrationMatch(sourceTitle, candidate.title),
    }))
    .filter((candidate) => candidate.confidence > 0)
    .slice()
    .sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title));
}
