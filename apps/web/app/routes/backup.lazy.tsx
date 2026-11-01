import { createLazyFileRoute } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { RestorePreviewReport } from '@app/db';
import { UserFacingError, type BackupDocumentV1 } from '@app/shared';
import {
  applyBackupImport,
  BackupPage,
  createBackupExport,
  downloadBackupDocument,
  parseBackupFileContent,
  previewBackupImport,
} from '@/features/backup/index.js';
import { extensionsQueryKeys } from '@app/extensions';
import { libraryQueryKeys } from '@app/library';
import { migrationQueryKeys } from '@/features/migration/index.js';
import { readerQueryKeys } from '@app/reader';
import { discoverQueryKeys, searchQueryKeys } from '@app/search';
import { settingsQueryKeys } from '@app/settings';
import { themeQueryKeys } from '@app/theme';

import { failureMessage } from '../lib/app-feedback.js';
import { useLocalDb, useLocalDbStatus } from '../providers/local-db-provider.js';

export const Route = createLazyFileRoute('/backup')({
  component: BackupRoute,
});

function BackupRoute() {
  const queryClient = useQueryClient();
  const db = useLocalDb();
  const dbStatus = useLocalDbStatus();
  const [lastExport, setLastExport] = useState<BackupDocumentV1 | null>(null);
  const [pendingDocument, setPendingDocument] = useState<unknown>(null);
  const [preview, setPreview] = useState<RestorePreviewReport | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const doc = await createBackupExport(db!);
      downloadBackupDocument(doc);
      return doc;
    },
    onSuccess: (doc) => {
      setLastExport(doc);
      setRestoreSuccess(false);
      setRestoreError(null);
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (content: string) => {
      const parsed = parseBackupFileContent(content);
      if (!parsed.ok) {
        // Says what is wrong with the file, in words written for the user.
        throw new UserFacingError(parsed.error.message);
      }
      const report = await previewBackupImport(db!, parsed.value);
      return { document: parsed.value, report };
    },
    onSuccess: ({ document, report }) => {
      setPendingDocument(document);
      setPreview(report);
      setRestoreSuccess(false);
      setRestoreError(null);
    },
    onError: (error) => {
      setPendingDocument(null);
      setPreview(null);
      setRestoreError(failureMessage(error, 'Could not read backup file.'));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (pendingDocument === null) {
        throw new Error('No backup selected.');
      }
      const result = await applyBackupImport(db!, pendingDocument);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    onSuccess: () => {
      setRestoreSuccess(true);
      setRestoreError(null);
      setPreview(null);
      setPendingDocument(null);
      void queryClient.invalidateQueries({ queryKey: libraryQueryKeys.all });
      // Restore rewrites reader settings, app settings, chapter read state and
      // migration history. Mounted bridges and the reader hold the pre-restore
      // rows for the stale window, so every affected surface refetches.
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: themeQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: migrationQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: readerQueryKeys.all });
      // Restore also replaces the installed-extension snapshots and provider
      // settings the provider pickers and search fan-out read.
      void queryClient.invalidateQueries({ queryKey: extensionsQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.providers() });
      // Search pages read restored local identities; discover feeds read the
      // restored extension/provider rows.
      void queryClient.invalidateQueries({ queryKey: searchQueryKeys.pages() });
      void queryClient.invalidateQueries({ queryKey: discoverQueryKeys.all });
    },
    onError: (error) => {
      setRestoreSuccess(false);
      setRestoreError(failureMessage(error, 'Restore failed.'));
    },
  });

  return (
    <BackupPage
      isLoading={dbStatus === 'loading'}
      isError={dbStatus === 'error'}
      isExporting={exportMutation.isPending}
      isRestoring={restoreMutation.isPending || previewMutation.isPending}
      lastExport={lastExport}
      preview={preview}
      restoreError={restoreError}
      restoreSuccess={restoreSuccess}
      onExport={() => exportMutation.mutate()}
      onSelectFile={(content) => previewMutation.mutate(content)}
      onRestore={() => restoreMutation.mutate()}
      onClearPreview={() => {
        setPreview(null);
        setPendingDocument(null);
        setRestoreError(null);
      }}
      onDismissRestoreStatus={() => {
        setRestoreSuccess(false);
        setRestoreError(null);
      }}
    />
  );
}
