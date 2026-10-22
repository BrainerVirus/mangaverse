import type { ChangeEvent } from 'react';
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
        <AlertDescription>
          No conflicts detected. You can restore this backup after confirming.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Restore preview issues">
      {issues.map((issue) => (
        <li
          key={`${issue.code}-${issue.message}`}
          className="rounded-control bg-muted/40 p-3 text-sm"
        >
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={issue.severity === 'error' ? 'destructive' : 'secondary'}>
              {issue.severity}
            </Badge>
            <span className="font-medium text-foreground">{issue.code}</span>
          </div>
          <p className="text-muted-foreground">{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}

function RestoreStatus({
  restoreSuccess,
  restoreError,
  onDismissRestoreStatus,
}: {
  restoreSuccess: boolean;
  restoreError: string | null;
  onDismissRestoreStatus: () => void;
}) {
  return (
    <>
      {restoreSuccess ? (
        <Alert>
          <AlertTitle>Restore complete</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your local library, categories, chapter progress, migration history and the settings
              this backup carries were replaced. Sections missing from older backups are kept.
            </span>
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
    </>
  );
}

function RestorePreviewPanel({
  preview,
  isRestoring,
  onRequestConfirm,
}: {
  preview: RestorePreviewReport;
  isRestoring: boolean;
  onRequestConfirm: () => void;
}) {
  const summary = summarizeRestorePreview(preview);
  const { counts } = preview;
  const countRows = [
    { label: 'Library entries', value: counts.libraryEntries },
    { label: 'Categories', value: counts.categories },
    { label: 'Category links', value: counts.categoryMemberships },
    { label: 'Chapters', value: counts.chapters },
    { label: 'Chapter progress', value: counts.chapterReadStates },
    { label: 'Reading history', value: counts.readingHistory },
    { label: 'Migration history', value: counts.migrationHistory },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant={summary.canRestore ? 'default' : 'destructive'}>
          {summary.canRestore ? 'Valid backup' : 'Cannot restore'}
        </Badge>
        {summary.warningCount > 0 ? (
          <Badge variant="secondary">{summary.warningCount} warnings</Badge>
        ) : null}
        {summary.infoCount > 0 ? <Badge variant="outline">{summary.infoCount} notes</Badge> : null}
      </div>
      <dl
        aria-label="Backup contents"
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-control bg-muted/30 p-3 text-sm sm:grid-cols-3"
      >
        {countRows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium tabular-nums text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      {preview.schemaVersion !== null && preview.schemaVersion < 4 ? (
        <p className="text-sm text-muted-foreground">
          This backup predates categories, chapter progress, reading history and migration history.
          Existing local records for those sections are kept.
        </p>
      ) : null}
      <PreviewIssueList preview={preview} />
      <Button
        variant="destructive"
        disabled={!summary.canRestore || isRestoring}
        onClick={onRequestConfirm}
      >
        Restore backup
      </Button>
    </div>
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

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    onSelectFile(await file.text());
  };

  if (isLoading) {
    return (
      <section aria-label="Backup and restore" className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label="Backup and restore" className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Could not load backup tools"
          message="Local database is unavailable. Try reloading the page."
        />
      </section>
    );
  }

  return (
    <section aria-label="Backup and restore" className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Backup &amp; Restore
        </h1>
        <p className="text-sm text-muted-foreground">
          Export your library, categories, reading progress, providers, and settings to a local
          file. Import a backup to replace current local data.
        </p>
      </header>

      <RestoreStatus
        restoreSuccess={restoreSuccess}
        restoreError={restoreError}
        onDismissRestoreStatus={onDismissRestoreStatus}
      />

      <SettingsSection
        title="Export backup"
        description="Download a JSON snapshot of library entries, categories, chapter progress, reading history, migration history, manga identities, installed providers, and settings."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onExport} disabled={isExporting}>
            {isExporting ? 'Creating backup…' : 'Export backup'}
          </Button>
          {lastExport !== null ? (
            <p className="text-sm text-muted-foreground">
              Last export: {lastExport.metadata.createdAt} · {lastExport.library.length} library
              entries · {lastExport.categories?.length ?? 0} categories ·{' '}
              {lastExport.chapterReadStates?.length ?? 0} chapter progress ·{' '}
              {lastExport.installedExtensions.length} providers
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Import backup"
        description="Select a MangaVerse backup file. The app validates format, shows what the backup carries, and previews conflicts before replacing data."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose backup file"
              onChange={(event) => void handleFileChange(event)}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
            >
              Choose backup file
            </Button>
            {preview !== null ? (
              <Button variant="ghost" onClick={onClearPreview} disabled={isRestoring}>
                Clear preview
              </Button>
            ) : null}
          </div>

          {preview !== null ? (
            <RestorePreviewPanel
              preview={preview}
              isRestoring={isRestoring}
              onRequestConfirm={() => setConfirmOpen(true)}
            />
          ) : null}
        </div>
      </SettingsSection>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace local data?</DialogTitle>
            <DialogDescription>
              This will replace your current library, categories and category links, chapter
              progress, reading history, migration history, installed provider records, and
              backup-covered settings. Older backups that do not carry the newer sections keep their
              local records. This action cannot be undone automatically.
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
    </section>
  );
}
