import { rankMigrationSearchResults } from './score-migration-match.js';
import type { MigrationSearchCandidate, MigrationSearchResult } from './types.js';

export type MigrationTargetSearchOutcome =
  | { readonly status: 'ok'; readonly results: readonly MigrationSearchResult[] }
  | { readonly status: 'error'; readonly message: string };

/**
 * Searches one provider for a title and ranks what came back. A provider error
 * is an outcome, not a rejection: one broken target must not blank the page.
 */
export async function searchMigrationTargets(
  sourceTitle: string,
  search: (query: string) => Promise<readonly MigrationSearchCandidate[]>,
): Promise<MigrationTargetSearchOutcome> {
  const query = sourceTitle.trim();
  if (query.length === 0) {
    return { status: 'ok', results: [] };
  }

  try {
    const candidates = await search(query);
    return { status: 'ok', results: rankMigrationSearchResults(query, candidates) };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Target provider search failed.',
    };
  }
}
