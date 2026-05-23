import { createLazyFileRoute } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { RestorePreviewReport } from '@app/db';
import type { BackupDocumentV1 } from '@app/shared';
import {
  applyBackupImport,
  BackupPage,
  createBackupExport,
  downloadBackupDocument,
  parseBackupFileContent,
  previewBackupImport,
} from '@app/backup';
import { libraryQueryKeys } from '@app/library';
import { themeQueryKeys } from '@app/theme';

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
        throw new Error(parsed.error.message);
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
      setRestoreError(error instanceof Error ? error.message : 'Could not read backup file.');
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
      void queryClient.invalidateQueries({ queryKey: themeQueryKeys.all });
    },
    onError: (error) => {
      setRestoreSuccess(false);
      setRestoreError(error instanceof Error ? error.message : 'Restore failed.');
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
