import { createLazyFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { MigrationPreviewReport } from '@app/db';
import { toMangaId } from '@app/shared';
import {
  applyMigration,
  fetchMigrationCandidates,
  fetchMigrationProviders,
  MigrationPage,
  migrationQueryKeys,
  previewMigration,
  summarizeMigrationApply,
} from '@app/migration';
import { libraryQueryKeys } from '@app/library';

import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createLazyFileRoute('/migration')({
  component: MigrationRoute,
});

function MigrationRoute() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [sourceProviderId, setSourceProviderId] = useState<string | null>(null);
  const [targetProviderId, setTargetProviderId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<MigrationPreviewReport | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applySummary, setApplySummary] = useState<ReturnType<typeof summarizeMigrationApply> | null>(
    null,
  );

  const providersQuery = useQuery({
    queryKey: migrationQueryKeys.providers(),
    queryFn: () => fetchMigrationProviders(db!),
    enabled: db !== null && dbStatus === 'ready',
  });

  const candidatesQuery = useQuery({
    queryKey: migrationQueryKeys.candidates(sourceProviderId ?? 'none'),
    queryFn: () => fetchMigrationCandidates(db!, sourceProviderId!),
    enabled: db !== null && dbStatus === 'ready' && sourceProviderId !== null,
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (sourceProviderId === null || targetProviderId === null) {
        throw new Error('Select source and target providers.');
      }

      const draftSelections = Object.entries(selections)
        .map(([mangaId, targetProviderMangaId]) => ({
          mangaId: toMangaId(mangaId),
          targetProviderMangaId: targetProviderMangaId.trim(),
        }))
        .filter((selection) => selection.targetProviderMangaId.length > 0);

      return previewMigration(db!, {
        sourceProviderId,
        targetProviderId,
        selections: draftSelections,
      });
    },
    onSuccess: (report) => {
      setPreview(report);
      setApplySuccess(false);
      setApplyError(null);
      setApplySummary(null);
    },
    onError: (error) => {
      setPreview(null);
      setApplyError(error instanceof Error ? error.message : 'Could not preview migration.');
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (preview === null || sourceProviderId === null || targetProviderId === null) {
        throw new Error('Preview migration before applying.');
      }

      const draftSelections = preview.items
        .filter((item) => !item.blocked)
        .map((item) => ({
          mangaId: item.mangaId,
          targetProviderMangaId: item.targetProviderMangaId,
        }));

      const result = await applyMigration(db!, {
        sourceProviderId,
        targetProviderId,
        selections: draftSelections,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    },
    onSuccess: (report) => {
      setApplySuccess(true);
      setApplyError(null);
      setApplySummary(summarizeMigrationApply(report));
      setPreview(null);
      setSelections({});
      void queryClient.invalidateQueries({ queryKey: migrationQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
    },
    onError: (error) => {
      setApplySuccess(false);
      setApplyError(error instanceof Error ? error.message : 'Migration failed.');
    },
  });

  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);
  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);

  return (
    <MigrationPage
      isLoading={dbStatus === 'loading' || providersQuery.isLoading}
      isError={dbStatus === 'error'}
      isPreviewing={previewMutation.isPending}
      isApplying={applyMutation.isPending}
      providers={providers}
      candidates={candidates}
      sourceProviderId={sourceProviderId}
      targetProviderId={targetProviderId}
      selections={selections}
      preview={preview}
      applySummary={applySummary}
      applyError={applyError}
      applySuccess={applySuccess}
      onSourceProviderChange={(providerId) => {
        setSourceProviderId(providerId);
        setTargetProviderId(null);
        setSelections({});
        setPreview(null);
        setApplySuccess(false);
        setApplyError(null);
      }}
      onTargetProviderChange={(providerId) => {
        setTargetProviderId(providerId);
        setPreview(null);
        setApplySuccess(false);
        setApplyError(null);
      }}
      onTargetMangaIdChange={(mangaId, targetProviderMangaId) => {
        setSelections((current) => ({ ...current, [mangaId]: targetProviderMangaId }));
        setPreview(null);
      }}
      onPreview={() => previewMutation.mutate()}
      onApply={() => applyMutation.mutate()}
      onClearPreview={() => {
        setPreview(null);
        setApplyError(null);
      }}
      onDismissApplyStatus={() => {
        setApplySuccess(false);
        setApplyError(null);
        setApplySummary(null);
      }}
    />
  );
}
