import type { AppDrizzleDb } from '@app/db';
import type { MigrationSearchCandidate } from '@app/migration';
import { migrationQueryKeys, searchMigrationTargets } from '@app/migration';
import { queryOptions } from '@tanstack/react-query';

import { resolveInstalledProvider } from '../lib/provider-registry.js';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-timing.js';

/** Candidates shown per target title; enough to rank, few enough to scan. */
const TARGET_SEARCH_LIMIT = 12;

/**
 * Searches one installed provider for a title through its runtime contract.
 * Provider ids stay raw here so the migration selection can persist them.
 */
export async function searchProviderMangaTargets(
  db: AppDrizzleDb,
  providerId: string,
  query: string,
  signal?: AbortSignal,
): Promise<MigrationSearchCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const provider = await resolveInstalledProvider(db, providerId);
  if (provider === null) {
    throw new Error(`${providerId} is not installed or enabled.`);
  }
  if (provider.search === undefined) {
    throw new Error(`${providerId} does not support search.`);
  }

  const result = await provider.search(
    {
      manifest: provider.manifest,
      providerId,
      ...(signal !== undefined ? { signal } : {}),
    },
    { query: trimmed, limit: TARGET_SEARCH_LIMIT },
  );

  return result.items.map((item) => ({
    providerMangaId: String(item.providerMangaId),
    title: item.title,
  }));
}

/**
 * One target search per library title. Failures resolve to an error outcome
 * so a broken provider only marks its own row.
 */
export function migrationTargetSearchQueryOptions(
  db: AppDrizzleDb,
  targetProviderId: string | null,
  query: string,
  enabled = true,
) {
  const providerId = targetProviderId;
  const trimmed = query.trim();

  return queryOptions({
    queryKey: migrationQueryKeys.targetSearch(providerId ?? 'none', trimmed),
    queryFn: ({ signal }) => {
      if (providerId === null) {
        return searchMigrationTargets(trimmed, async () => {
          throw new Error('Select a target provider first.');
        });
      }
      return searchMigrationTargets(trimmed, (title) =>
        searchProviderMangaTargets(db, providerId, title, signal),
      );
    },
    enabled: enabled && providerId !== null && trimmed.length > 0,
    staleTime: QUERY_STALE_TIMES.search,
    gcTime: QUERY_GC_TIMES.search,
  });
}
