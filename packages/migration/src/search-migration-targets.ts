import { rankMigrationSearchResults } from './score-migration-match.js';
import type {
  MigrationSearchCandidate,
  MigrationSearchResult,
  MigrationTargetSearchState,
} from './types.js';

export type MigrationTargetSearchOutcome =
  | { readonly status: 'ok'; readonly results: readonly MigrationSearchResult[] }
  | { readonly status: 'error'; readonly message: string };

/**
 * Renders one query's data, in-flight flag and error as row state. A retry that
 * keeps the previous error data still reports loading, not a stale error.
 */
export function toMigrationTargetSearchState(input: {
  readonly data: MigrationTargetSearchOutcome | undefined;
  readonly isFetching: boolean;
  readonly error: unknown;
}): MigrationTargetSearchState {
  if (input.data === undefined) {
    return {
      isLoading: input.isFetching,
      error:
        input.error === null || input.error === undefined
          ? null
          : input.error instanceof Error
            ? input.error.message
            : 'Target search failed.',
      results: [],
    };
  }

  if (input.data.status === 'error') {
    return { isLoading: input.isFetching, error: input.data.message, results: [] };
  }

  return { isLoading: input.isFetching, error: null, results: input.data.results };
}

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
