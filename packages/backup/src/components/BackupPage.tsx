import { useRef, useState } from 'react';
import type { RestorePreviewReport } from '@app/db';
import type { BackupDocumentV1 } from '@app/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  LoadingState,
  SettingsSection,
} from '@app/design-system';

import { summarizeRestorePreview } from '../summarize-restore-preview.js';

export interface BackupPageProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isExporting?: boolean;
  readonly isRestoring?: boolean;
  readonly lastExport?: BackupDocumentV1 | null;
  readonly preview?: RestorePreviewReport | null;
  readonly restoreError?: string | null;
  readonly restoreSuccess?: boolean;
  onExport: () => void;
  onSelectFile: (content: string) => void;
  onRestore: () => void;
  onClearPreview: () => void;
  onDismissRestoreStatus: () => void;
}

function PreviewIssueList({ preview }: { preview: RestorePreviewReport }) {
  const issues = [
    ...preview.backupIssues.map((issue) => ({ ...issue, severity: 'error' as const })),
    ...preview.previewIssues,
  ];

  if (issues.length === 0) {
    return (
      <Alert>
        <AlertTitle>Ready to restore</AlertTitle>
        <AlertDescription>No conflicts detected. You can restore this backup after confirming.</AlertDescription>
      </Alert>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Restore preview issues">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}-${index}`}
          className="rounded-[var(--radius-control)] border border-[var(--border)] p-3 text-sm"
        >
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={issue.severity === 'error' ? 'destructive' : 'secondary'}>{issue.severity}</Badge>
            <span className="font-medium text-foreground">{issue.code}</span>
          </div>
          <p className="text-muted-foreground">{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}

export function BackupPage({
  isLoading,
  isError,
  isExporting = false,
  isRestoring = false,
  lastExport = null,
  preview = null,
  restoreError = null,
  restoreSuccess = false,
  onExport,
  onSelectFile,
  onRestore,
  onClearPreview,
  onDismissRestoreStatus,
}: BackupPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load backup tools"
          message="Local database is unavailable. Try reloading the page."
        />
      </main>
    );
  }

  const previewSummary = preview !== null ? summarizeRestorePreview(preview) : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Backup &amp; Restore</h1>
        <p className="text-sm text-muted-foreground">
          Export your library, providers, and settings to a local file. Import a backup to replace current local data.
        </p>
      </header>

      {restoreSuccess ? (
        <Alert>
          <AlertTitle>Restore complete</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Your local library and settings were replaced with the backup contents.</span>
            <Button variant="outline" size="sm" onClick={onDismissRestoreStatus}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {restoreError !== null && restoreError !== '' ? (
        <Alert variant="destructive">
          <AlertTitle>Restore failed</AlertTitle>
          <AlertDescription>{restoreError}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection
        title="Export backup"
        description="Download a JSON snapshot of library entries, manga identities, installed providers, and settings."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onExport} disabled={isExporting}>
            {isExporting ? 'Creating backup…' : 'Export backup'}
          </Button>
          {lastExport !== null ? (
            <p className="text-sm text-muted-foreground">
              Last export: {lastExport.metadata.createdAt} · {lastExport.library.length} library entries ·{' '}
              {lastExport.installedExtensions.length} providers
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Import backup"
        description="Select a MangaVerse backup file. The app validates format and shows a restore preview before replacing data."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose backup file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file === undefined) return;
                void file.text().then(onSelectFile);
                event.target.value = '';
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isRestoring}>
              Choose backup file
            </Button>
            {preview !== null ? (
              <Button variant="ghost" onClick={onClearPreview} disabled={isRestoring}>
                Clear preview
              </Button>
            ) : null}
          </div>

          {preview !== null && previewSummary !== null ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={previewSummary.canRestore ? 'default' : 'destructive'}>
                  {previewSummary.canRestore ? 'Valid backup' : 'Cannot restore'}
                </Badge>
                {previewSummary.warningCount > 0 ? (
                  <Badge variant="secondary">{previewSummary.warningCount} warnings</Badge>
                ) : null}
                {previewSummary.infoCount > 0 ? (
                  <Badge variant="outline">{previewSummary.infoCount} notes</Badge>
                ) : null}
              </div>
              <PreviewIssueList preview={preview} />
              <Button
                variant="destructive"
                disabled={!previewSummary.canRestore || isRestoring}
                onClick={() => setConfirmOpen(true)}
              >
                Restore backup
              </Button>
            </div>
          ) : null}
        </div>
      </SettingsSection>

      {confirmOpen ? (
        <Dialog role="dialog" aria-modal="true" aria-labelledby="backup-restore-title">
          <DialogContent>
            <DialogHeader>
              <DialogTitle id="backup-restore-title">Replace local data?</DialogTitle>
              <DialogDescription>
                This will replace your current library, installed provider records, and backup-covered settings.
                Chapter caches and reading progress outside the backup schema may be removed with library identities.
                This action cannot be undone automatically.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isRestoring}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={isRestoring}
                onClick={() => {
                  setConfirmOpen(false);
                  onRestore();
                }}
              >
                {isRestoring ? 'Restoring…' : 'Confirm restore'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </main>
  );
}
