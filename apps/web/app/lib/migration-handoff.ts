import type {
  MigrationCandidate,
  MigrationHandoffError,
  MigrationProviderOption,
} from '@app/migration';
import { filterMigrationCandidatesByIds, findMissingMigrationMangaIds } from '@app/migration';

import type { MigrationSearch } from './migration-search.js';

const EMPTY_IDS: readonly string[] = [];

interface MigrationHandoff {
  readonly requestedMangaIds: readonly string[];
  readonly requestedSourceProviderIds: readonly string[];
  readonly initialSourceProviderId: string | null;
  readonly handoffError?: MigrationHandoffError;
  readonly handoffIdCount?: number;
}

/** Reads the validated URL hand-off into controller state. Bad links never prefill. */
export function readHandoff(search: MigrationSearch): MigrationHandoff {
  const requestedMangaIds = search.ids ?? EMPTY_IDS;
  const requestedSourceProviderIds = search.sources ?? EMPTY_IDS;
  const initialSourceProviderId =
    search.handoffError === undefined
      ? requestedSourceProviderIds.length === 1
        ? (requestedSourceProviderIds[0] ?? null)
        : requestedSourceProviderIds.length === 0
          ? (search.source ?? null)
          : null
      : null;

  return {
    requestedMangaIds,
    requestedSourceProviderIds,
    initialSourceProviderId,
    ...(search.handoffError === undefined ? {} : { handoffError: search.handoffError }),
    ...(search.handoffIdCount === undefined ? {} : { handoffIdCount: search.handoffIdCount }),
  };
}

/** Drops a prefilled source once the installed providers settle without it. */
export function resolveSourceProviderId(
  sourceProviderId: string | null,
  providers: readonly MigrationProviderOption[],
  providersSettled: boolean,
): string | null {
  if (
    sourceProviderId === null ||
    !providersSettled ||
    providers.some((provider) => provider.id === sourceProviderId)
  ) {
    return sourceProviderId;
  }
  return null;
}

/** The single prefilled source that is not installed or enabled, if any. */
export function findUnavailableRequestedSourceProviderId(input: {
  readonly activeSourceProviderId: string | null;
  readonly requestedSourceProviderIds: readonly string[];
  readonly providers: readonly MigrationProviderOption[];
  readonly providersSettled: boolean;
}): string | null {
  if (input.activeSourceProviderId !== null || !input.providersSettled) return null;
  if (input.requestedSourceProviderIds.length !== 1) return null;

  const requested = input.requestedSourceProviderIds[0];
  if (requested === undefined) return null;
  return input.providers.some((provider) => provider.id === requested) ? null : requested;
}

/**
 * Narrows candidates to the hand-off. A link spanning several providers shows
 * nothing until the user picks one, and an unavailable prefilled source reports
 * every requested title as skipped instead of showing an unfiltered batch.
 */
export function resolveRequestedCandidates(input: {
  readonly requestedMangaIds: readonly string[];
  readonly allCandidates: readonly MigrationCandidate[];
  readonly candidatesLoaded: boolean;
  readonly activeSourceProviderId: string | null;
  readonly sourceUnavailable: boolean;
}): { candidates: readonly MigrationCandidate[]; skippedRequestedIds: readonly string[] } {
  if (input.requestedMangaIds.length === 0) {
    return { candidates: input.allCandidates, skippedRequestedIds: EMPTY_IDS };
  }

  if (input.activeSourceProviderId === null) {
    return {
      candidates: [],
      skippedRequestedIds: input.sourceUnavailable ? input.requestedMangaIds : EMPTY_IDS,
    };
  }

  return {
    candidates: filterMigrationCandidatesByIds(input.allCandidates, input.requestedMangaIds),
    skippedRequestedIds: input.candidatesLoaded
      ? findMissingMigrationMangaIds(input.allCandidates, input.requestedMangaIds)
      : EMPTY_IDS,
  };
}
