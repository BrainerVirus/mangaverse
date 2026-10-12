import { useMemo, useState } from 'react';
import type { MigrationPreviewReport } from '@app/db';
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
  Input,
  Label,
  LoadingState,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
} from '@app/design-system';

import { summarizeMigrationPreview } from '../summarize-migration.js';
import type { MigrationApplySummary, MigrationCandidate, MigrationProviderOption } from '../types.js';

export interface MigrationPageProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isPreviewing?: boolean;
  readonly isApplying?: boolean;
  readonly providers: readonly MigrationProviderOption[];
  readonly candidates: readonly MigrationCandidate[];
  readonly sourceProviderId: string | null;
  readonly targetProviderId: string | null;
  readonly selections: Readonly<Record<string, string>>;
  readonly preview: MigrationPreviewReport | null;
  readonly applySummary: MigrationApplySummary | null;
  readonly applyError: string | null;
  readonly applySuccess: boolean;
  onSourceProviderChange: (providerId: string) => void;
  onTargetProviderChange: (providerId: string) => void;
  onTargetMangaIdChange: (mangaId: string, targetProviderMangaId: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onClearPreview: () => void;
  onDismissApplyStatus: () => void;
}

function PreviewIssueList({ preview }: { preview: MigrationPreviewReport }) {
  const summary = summarizeMigrationPreview(preview);

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Migration preview</AlertTitle>
        <AlertDescription>
          {summary.canApply
            ? `${summary.appliedCount} title(s) ready to migrate. ${summary.skippedCount} blocked.`
            : 'No titles can be migrated with the current selections.'}
        </AlertDescription>
      </Alert>

      <ul className="space-y-2" aria-label="Migration preview items">
        {preview.items.map((item) => (
          <li
            key={item.mangaId}
            className="rounded-[var(--radius-control)] border border-[var(--border)] p-3 text-sm"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{item.canonicalTitle}</span>
              {item.blocked ? (
                <Badge variant="destructive">blocked</Badge>
              ) : (
                <Badge variant="secondary">ready</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {item.sourceProviderMangaId} → {item.targetProviderMangaId}
            </p>
            {item.issues.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {item.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="text-muted-foreground">
                    <Badge variant={issue.severity === 'error' ? 'destructive' : 'secondary'}>
                      {issue.severity}
                    </Badge>{' '}
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MigrationPage({
  isLoading,
  isError,
  isPreviewing = false,
  isApplying = false,
  providers,
  candidates,
  sourceProviderId,
  targetProviderId,
  selections,
  preview,
  applySummary,
  applyError,
  applySuccess,
  onSourceProviderChange,
  onTargetProviderChange,
  onTargetMangaIdChange,
  onPreview,
  onApply,
  onClearPreview,
  onDismissApplyStatus,
}: MigrationPageProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const readySelectionCount = useMemo(() => {
    return candidates.filter((candidate) => {
      const targetId = selections[candidate.mangaId]?.trim();
      return targetId !== undefined && targetId.length > 0;
    }).length;
  }, [candidates, selections]);

  const canPreview =
    sourceProviderId !== null &&
    targetProviderId !== null &&
    sourceProviderId !== targetProviderId &&
    readySelectionCount > 0;

  if (isLoading) {
    return (
      <main className="app-shell">
        <LoadingState type="list" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="app-shell">
        <ErrorState
          title="Migration unavailable"
          message="Local database is not ready. Try again after the app finishes initializing."
        />
      </main>
    );
  }

  return (
    <main className="app-shell space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Migration</h1>
        <p className="text-sm text-muted-foreground">
          Move library titles from one provider to another. Review matches before applying changes.
        </p>
      </header>

      {applySuccess ? (
        <Alert>
          <AlertTitle>Migration applied</AlertTitle>
          <AlertDescription>
            {applySummary !== null
              ? `${applySummary.appliedCount} title(s) migrated. ${applySummary.skippedCount} skipped.`
              : 'Selected titles were migrated.'}
          </AlertDescription>
          <Button className="mt-3" variant="outline" size="sm" onClick={onDismissApplyStatus}>
            Dismiss
          </Button>
        </Alert>
      ) : null}

      {applyError !== null ? (
        <Alert variant="destructive">
          <AlertTitle>Migration failed</AlertTitle>
          <AlertDescription>{applyError}</AlertDescription>
          <Button className="mt-3" variant="outline" size="sm" onClick={onDismissApplyStatus}>
            Dismiss
          </Button>
        </Alert>
      ) : null}

      <SettingsSection title="Providers" description="Choose where titles come from and where they should move.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="migration-source-provider">Source provider</Label>
            <Select
              onValueChange={(value) => onSourceProviderChange(value)}
              {...(sourceProviderId !== null ? { value: sourceProviderId } : {})}
            >
              <SelectTrigger id="migration-source-provider" aria-label="Source provider">
                <SelectValue placeholder="Select source provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="migration-target-provider">Target provider</Label>
            <Select
              onValueChange={(value) => onTargetProviderChange(value)}
              disabled={sourceProviderId === null}
              {...(targetProviderId !== null ? { value: targetProviderId } : {})}
            >
              <SelectTrigger id="migration-target-provider" aria-label="Target provider">
                <SelectValue placeholder="Select target provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {providers
                    .filter((provider) => provider.id !== sourceProviderId)
                    .map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      {sourceProviderId !== null && targetProviderId !== null && sourceProviderId !== targetProviderId ? (
        <SettingsSection
          title="Library titles"
          description="Enter the target provider manga id for each title you want to migrate."
        >
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No library titles are linked to the selected source provider.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Migration candidates">
              {candidates.map((candidate) => (
                <li
                  key={candidate.mangaId}
                  className="rounded-[var(--radius-control)] border border-[var(--border)] p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{candidate.canonicalTitle}</span>
                    {candidate.isDefaultProvider ? <Badge variant="secondary">default</Badge> : null}
                    {candidate.isActiveProvider ? <Badge variant="secondary">active</Badge> : null}
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Source id: {candidate.sourceProviderMangaId}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor={`target-${candidate.mangaId}`}>Target provider manga id</Label>
                    <Input
                      id={`target-${candidate.mangaId}`}
                      value={selections[candidate.mangaId] ?? ''}
                      onChange={(event) =>
                        onTargetMangaIdChange(candidate.mangaId, event.target.value)
                      }
                      placeholder="Enter target provider manga id"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onPreview} disabled={!canPreview || isPreviewing || isApplying}>
              {isPreviewing ? 'Previewing…' : 'Preview migration'}
            </Button>
            {preview !== null ? (
              <Button variant="outline" onClick={onClearPreview} disabled={isPreviewing || isApplying}>
                Clear preview
              </Button>
            ) : null}
          </div>
        </SettingsSection>
      ) : null}

      {preview !== null ? (
        <SettingsSection title="Review" description="Confirm warnings before applying migration.">
          <PreviewIssueList preview={preview} />
          <div className="mt-4">
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!summarizeMigrationPreview(preview).canApply || isApplying}
            >
              Apply migration
            </Button>
          </div>
        </SettingsSection>
      ) : null}

      {confirmOpen ? (
        <Dialog role="dialog" aria-modal="true" aria-labelledby="migration-apply-title">
          <DialogContent>
            <DialogHeader>
              <DialogTitle id="migration-apply-title">Apply migration?</DialogTitle>
              <DialogDescription>
                This updates provider mappings for the selected titles. Consider exporting a backup
                before large migrations.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setConfirmOpen(false);
                  onApply();
                }}
                disabled={isApplying}
              >
                {isApplying ? 'Applying…' : 'Confirm migration'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </main>
  );
}
