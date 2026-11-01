import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import type { AppDrizzleDb, MigrationApplyReport, MigrationPreviewReport } from '@app/db';
import { toMangaId } from '@app/shared';
import {
  applyMigration,
  buildMigrationApplyReport,
  fetchMigrationCandidates,
  fetchMigrationHistory,
  fetchMigrationProviders,
  migrationQueryKeys,
  previewMigration,
  rollbackMigration,
  selectAllMatched,
  summarizeMigrationRollback,
  toMigrationTargetSearchState,
  type MigrationPageProps,
  type MigrationTargetSearchState,
} from '@/features/migration/index.js';
import { libraryQueryKeys } from '@app/library';

import { failureMessage } from '../lib/app-feedback.js';
import type { MigrationSearch } from '../lib/migration-search.js';
import {
  findUnavailableRequestedSourceProviderId,
  readHandoff,
  resolveRequestedCandidates,
  resolveSourceProviderId,
} from '../lib/migration-handoff.js';
import { migrationTargetSearchQueryOptions } from './migration-query-options.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

const SEARCH_DEBOUNCE_MS = 300;

interface LastApply {
  readonly report: MigrationApplyReport;
  readonly sourceProviderId: string;
  readonly targetProviderId: string;
}

async function fetchRequestedTitles(
  db: AppDrizzleDb,
  mangaIds: readonly string[],
): Promise<Record<string, string>> {
  const { getMangaIdentities } = await import('@app/db');
  const identities = await getMangaIdentities(db, mangaIds.map(toMangaId));
  const titles: Record<string, string> = {};
  for (const identity of identities) titles[identity.id] = identity.canonicalTitle;
  return titles;
}

/** Titles for skipped ids, so the notice does not fall back to raw ids. */
function useRequestedTitles(
  db: AppDrizzleDb | null,
  dbReady: boolean,
  mangaIds: readonly string[],
) {
  return useQuery({
    queryKey: [...migrationQueryKeys.all, 'requested-titles', mangaIds] as const,
    queryFn: () => fetchRequestedTitles(db!, mangaIds),
    enabled: db !== null && dbReady && mangaIds.length > 0,
  });
}

/** One rule for enabling per-row target searches; keeps the hook body readable. */
function isTargetSearchEnabled(input: {
  readonly db: AppDrizzleDb | null;
  readonly dbStatus: string;
  readonly targetProviderId: string | null;
  readonly activeSourceProviderId: string | null;
}): boolean {
  return (
    input.db !== null &&
    input.dbStatus === 'ready' &&
    input.targetProviderId !== null &&
    input.activeSourceProviderId !== input.targetProviderId
  );
}

/**
 * Migration page state and side effects, kept out of the route component so the
 * page stays a thin render of one props object.
 */
export function useMigrationController(search: MigrationSearch = {}): MigrationPageProps {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const {
    requestedMangaIds,
    requestedSourceProviderIds,
    initialSourceProviderId,
    handoffError,
    handoffIdCount,
  } = readHandoff(search);
  const [sourceProviderId, setSourceProviderId] = useState<string | null>(initialSourceProviderId);
  const [targetProviderId, setTargetProviderId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [committedQueries, setCommittedQueries] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<MigrationPreviewReport | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [lastApply, setLastApply] = useState<LastApply | null>(null);
  const [rolledBack, setRolledBack] = useState(false);
  const [rollbackSummary, setRollbackSummary] = useState<ReturnType<
    typeof summarizeMigrationRollback
  > | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const pendingQueries = useRef<Record<string, string>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const providersQuery = useQuery({
    queryKey: migrationQueryKeys.providers(),
    queryFn: () => fetchMigrationProviders(db!),
    enabled: db !== null && dbStatus === 'ready',
  });

  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);
  const activeSourceProviderId = resolveSourceProviderId(
    sourceProviderId,
    providers,
    providersQuery.isSuccess,
  );
  const unavailableRequestedSourceProviderId = findUnavailableRequestedSourceProviderId({
    activeSourceProviderId,
    requestedSourceProviderIds,
    providers,
    providersSettled: providersQuery.isSuccess,
  });

  const candidatesQuery = useQuery({
    queryKey: migrationQueryKeys.candidates(activeSourceProviderId ?? 'none'),
    queryFn: () => fetchMigrationCandidates(db!, activeSourceProviderId!),
    enabled:
      db !== null &&
      dbStatus === 'ready' &&
      activeSourceProviderId !== null &&
      providersQuery.isSuccess,
  });

  const historyQuery = useQuery({
    queryKey: migrationQueryKeys.history(),
    queryFn: () => fetchMigrationHistory(db!),
    enabled: db !== null && dbStatus === 'ready',
  });

  const allCandidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);
  const { candidates, skippedRequestedIds } = resolveRequestedCandidates({
    requestedMangaIds,
    allCandidates,
    candidatesLoaded: candidatesQuery.isSuccess,
    activeSourceProviderId,
    sourceUnavailable: unavailableRequestedSourceProviderId !== null,
  });

  const requestedTitlesQuery = useRequestedTitles(db, dbStatus === 'ready', skippedRequestedIds);

  const searchEnabled = isTargetSearchEnabled({
    db,
    dbStatus,
    targetProviderId,
    activeSourceProviderId,
  });

  const targetSearchResults = useQueries({
    queries: candidates.map((candidate) =>
      migrationTargetSearchQueryOptions(
        db!,
        targetProviderId,
        committedQueries[candidate.mangaId] ?? candidate.canonicalTitle,
        searchEnabled,
      ),
    ),
  });

  const targetSearches = useMemo(() => {
    const map: Record<string, MigrationTargetSearchState> = {};

    candidates.forEach((candidate, index) => {
      const query = targetSearchResults[index];
      map[candidate.mangaId] = toMigrationTargetSearchState({
        data: query?.data,
        isFetching: query?.isFetching ?? false,
        error: query?.error ?? null,
      });
    });

    return map;
  }, [candidates, targetSearchResults]);

  const resultsByMangaId = useMemo(() => {
    const map: Record<string, (typeof targetSearches)[string]['results']> = {};
    for (const candidate of candidates) {
      map[candidate.mangaId] = targetSearches[candidate.mangaId]?.results ?? [];
    }
    return map;
  }, [candidates, targetSearches]);

  const targetTitleFor = (mangaId: string, targetProviderMangaId: string): string | undefined => {
    return resultsByMangaId[mangaId]?.find(
      (result) => result.providerMangaId === targetProviderMangaId,
    )?.title;
  };

  const titlesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const candidate of candidates) map[candidate.mangaId] = candidate.canonicalTitle;
    return map;
  }, [candidates]);

  const blockedMangaIds = useMemo(() => {
    return new Set(
      (preview?.items ?? []).filter((item) => item.blocked).map((item) => String(item.mangaId)),
    );
  }, [preview]);

  const applyReport = useMemo(() => {
    return lastApply === null ? null : buildMigrationApplyReport(lastApply.report, titlesById);
  }, [lastApply, titlesById]);

  const canRollback =
    lastApply !== null && lastApply.report.applied.length > 0 && rolledBack === false;

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (activeSourceProviderId === null || targetProviderId === null) {
        throw new Error('Select source and target providers.');
      }

      const draftSelections = Object.entries(selections).flatMap(
        ([mangaId, targetProviderMangaId]) => {
          const targetId = targetProviderMangaId.trim();
          if (targetId.length === 0) return [];
          const targetProviderTitle = targetTitleFor(mangaId, targetId);
          return [
            {
              mangaId: toMangaId(mangaId),
              targetProviderMangaId: targetId,
              ...(targetProviderTitle !== undefined ? { targetProviderTitle } : {}),
            },
          ];
        },
      );

      return previewMigration(db!, {
        sourceProviderId: activeSourceProviderId,
        targetProviderId,
        selections: draftSelections,
      });
    },
    onSuccess: (report) => {
      setPreview(report);
      setApplyError(null);
    },
    onError: (error) => {
      setPreview(null);
      setApplyError(failureMessage(error, 'Could not preview migration.'));
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (): Promise<LastApply> => {
      if (preview === null || activeSourceProviderId === null || targetProviderId === null) {
        throw new Error('Preview migration before applying.');
      }

      const draftSelections = preview.items
        .filter((item) => !item.blocked)
        .map((item) => ({
          mangaId: item.mangaId,
          targetProviderMangaId: item.targetProviderMangaId,
          ...(item.targetProviderTitle !== undefined
            ? { targetProviderTitle: item.targetProviderTitle }
            : {}),
        }));

      const result = await applyMigration(db!, {
        sourceProviderId: activeSourceProviderId,
        targetProviderId,
        selections: draftSelections,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return {
        report: result.value,
        sourceProviderId: activeSourceProviderId,
        targetProviderId,
      };
    },
    onSuccess: (applied) => {
      setLastApply(applied);
      setApplyError(null);
      setRolledBack(false);
      setRollbackSummary(null);
      setRollbackError(null);
      setPreview(null);
      setSelections({});
      void queryClient.invalidateQueries({ queryKey: migrationQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
    },
    onError: (error) => {
      setApplyError(failureMessage(error, 'Migration failed.'));
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      if (lastApply === null) {
        throw new Error('No applied migration to undo.');
      }

      const result = await rollbackMigration(db!, {
        batchId: lastApply.report.batchId,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    },
    onSuccess: (report) => {
      setRollbackSummary(summarizeMigrationRollback(report, titlesById));
      setRollbackError(null);
      setRolledBack(true);
      void queryClient.invalidateQueries({ queryKey: migrationQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
    },
    onError: (error) => {
      setRollbackError(failureMessage(error, 'Could not undo migration.'));
    },
  });

  return {
    isLoading: dbStatus === 'loading' || providersQuery.isLoading,
    isError: dbStatus === 'error',
    isPreviewing: previewMutation.isPending,
    isApplying: applyMutation.isPending,
    isRollingBack: rollbackMutation.isPending,
    providers,
    candidates,
    sourceProviderId: activeSourceProviderId,
    targetProviderId,
    requestedMangaIds,
    requestedSourceProviderIds,
    skippedRequestedIds,
    requestedTitles: requestedTitlesQuery.data ?? {},
    unavailableRequestedSourceProviderId,
    ...(handoffError === undefined ? {} : { handoffError }),
    ...(handoffIdCount === undefined ? {} : { handoffIdCount }),
    selections,
    searchQueries,
    committedSearchQueries: committedQueries,
    targetSearches,
    preview,
    applyReport,
    applyError,
    canRollback,
    rollbackSummary,
    rollbackError,
    history: historyQuery.data ?? [],
    onSourceProviderChange: (providerId) => {
      setSourceProviderId(providerId);
      setTargetProviderId(null);
      setSelections({});
      setPreview(null);
      setApplyError(null);
    },
    onTargetProviderChange: (providerId) => {
      setTargetProviderId(providerId);
      setSelections({});
      setPreview(null);
      setApplyError(null);
      setRolledBack(false);
      setRollbackSummary(null);
      setRollbackError(null);
    },
    onTargetMangaIdChange: (mangaId, targetProviderMangaId) => {
      setSelections((current) => ({ ...current, [mangaId]: targetProviderMangaId }));
      setPreview(null);
      setApplyError(null);
    },
    onSearchQueryChange: (mangaId, query) => {
      pendingQueries.current = { ...pendingQueries.current, [mangaId]: query };
      setSearchQueries(pendingQueries.current);
      // Debounce: coalesce keystrokes so a title edit issues one search.
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        searchTimer.current = null;
        setCommittedQueries(pendingQueries.current);
      }, SEARCH_DEBOUNCE_MS);
    },
    onRetryTargetSearch: (mangaId) => {
      const index = candidates.findIndex((candidate) => candidate.mangaId === mangaId);
      const query = targetSearchResults[index];
      if (query !== undefined) void query.refetch();
    },
    onSelectAllMatched: () => {
      setSelections((current) =>
        selectAllMatched({
          candidates,
          resultsByMangaId,
          selections: current,
          blockedMangaIds,
        }),
      );
      setPreview(null);
      setApplyError(null);
    },
    onDeselectAll: () => {
      setSelections({});
      setPreview(null);
      setApplyError(null);
    },
    onPreview: () => previewMutation.mutate(),
    onApply: () => applyMutation.mutate(),
    onClearPreview: () => {
      setPreview(null);
      setApplyError(null);
    },
    onDismissApplyStatus: () => {
      setLastApply(null);
      setApplyError(null);
      setRolledBack(false);
      setRollbackSummary(null);
      setRollbackError(null);
    },
    onRollback: () => rollbackMutation.mutate(),
    onOpenBackup: () => {
      // New tab: navigating away would unmount the prepared preview and draft.
      window.open('/backup', '_blank', 'noopener,noreferrer');
    },
  };
}
