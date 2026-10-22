/**
 * Title comparison for local duplicate detection. NFKD splits accents;
 * stripping the marks keeps every script while making "Kuro no Shoukanshi"
 * and "Kuro no Shōkanshi" compare equal.
 */
export function normalizeTitleForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function titleTokens(value: string): ReadonlySet<string> {
  return new Set(normalizeTitleForMatch(value).split(/\s+/).filter(Boolean));
}

/** 1 for the same normalized title, lower for containment or token overlap. */
export function scoreTitleMatch(sourceTitle: string, candidateTitle: string): number {
  const source = normalizeTitleForMatch(sourceTitle);
  const candidate = normalizeTitleForMatch(candidateTitle);
  if (source.length === 0 || candidate.length === 0) return 0;
  if (source === candidate) return 1;

  if (candidate.includes(source) || source.includes(candidate)) {
    const shorter = Math.min(source.length, candidate.length);
    const longer = Math.max(source.length, candidate.length);
    return 0.75 + (shorter / longer) * 0.2;
  }

  const sourceTokens = titleTokens(sourceTitle);
  const candidateTokens = titleTokens(candidateTitle);
  if (sourceTokens.size === 0 || candidateTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }

  // Same tokens in a different order are a high match, not an exact string.
  return Math.min(0.9, overlap / Math.max(sourceTokens.size, candidateTokens.size));
}
