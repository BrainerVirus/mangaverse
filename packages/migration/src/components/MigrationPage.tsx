import { useMemo, useState, type ReactNode } from 'react';
import type { MigrationHistoryEntry, MigrationPreviewReport } from '@app/db';
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

import { MIGRATION_BATCH_LIMIT, summarizeMigrationBatch } from '../batch-migration.js';
import { migrationConfidenceBand } from '../score-migration-match.js';
import { summarizeMigrationPreview } from '../summarize-migration.js';
import type {
  MigrationApplyReportView,
  MigrationCandidate,
  MigrationConfidenceBand,
  MigrationHandoffError,
  MigrationProviderOption,
  MigrationRollbackSummary,
  MigrationSearchResult,
  MigrationTargetSearchState,
} from '../types.js';

export interface MigrationPageProps {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isPreviewing?: boolean;
  readonly isApplying?: boolean;
  readonly isRollingBack?: boolean;
  readonly providers: readonly MigrationProviderOption[];
  readonly candidates: readonly MigrationCandidate[];
  readonly sourceProviderId: string | null;
  readonly targetProviderId: string | null;
  readonly selections: Readonly<Record<string, string>>;
  readonly searchQueries: Readonly<Record<string, string>>;
  readonly committedSearchQueries: Readonly<Record<string, string>>;
  readonly targetSearches: Readonly<Record<string, MigrationTargetSearchState>>;
  readonly preview: MigrationPreviewReport | null;
  readonly applyReport: MigrationApplyReportView | null;
  readonly applyError: string | null;
  readonly canRollback: boolean;
  readonly rollbackSummary: MigrationRollbackSummary | null;
  readonly rollbackError: string | null;
  readonly history: readonly MigrationHistoryEntry[];
  /** Manga ids handed over by the library bulk action. */
  readonly requestedMangaIds?: readonly string[];
  /** Providers the hand-off titles read from; more than one asks the user to choose. */
  readonly requestedSourceProviderIds?: readonly string[];
  /** Requested ids absent from the selected source, shown as skipped. */
  readonly skippedRequestedIds?: readonly string[];
  /** Titles for the skipped ids, when the local database still knows them. */
  readonly requestedTitles?: Readonly<Record<string, string>>;
  /** A prefilled source that is no longer installed or enabled. */
  readonly unavailableRequestedSourceProviderId?: string | null;
  /** Set when the link could not be read as a batch; batch mode stays blocked. */
  readonly handoffError?: MigrationHandoffError;
  /** How many ids an over-limit link carried. */
  readonly handoffIdCount?: number;
  onSourceProviderChange: (providerId: string) => void;
  onTargetProviderChange: (providerId: string) => void;
  onTargetMangaIdChange: (mangaId: string, targetProviderMangaId: string) => void;
  onSearchQueryChange: (mangaId: string, query: string) => void;
  onRetryTargetSearch: (mangaId: string) => void;
  onSelectAllMatched: () => void;
  onDeselectAll: () => void;
  onPreview: () => void;
  onApply: () => void;
  onClearPreview: () => void;
  onDismissApplyStatus: () => void;
  onRollback: () => void;
  onOpenBackup: () => void;
  /** Clears a rejected hand-off link and returns to a plain migration page. */
  onClearHandoff?: () => void;
}

const PRESERVED_ITEMS = [
  'Reading progress and read state',
  'Categories and collections',
  'Favorite and library entry',
  'Tracking links where the target supports them',
  'Reader settings and per-title overrides',
] as const;

const NOT_MIGRATED_ITEMS = [
  'Downloaded or cached chapter files',
  'Source provider ids, auth and provider-only metadata',
  'Provider-specific URLs and page caches',
] as const;

const EMPTY_REQUESTED_IDS: readonly string[] = [];
const EMPTY_REQUESTED_TITLES: Readonly<Record<string, string>> = {};

function targetMappingLabel(item: {
  readonly targetProviderTitle?: string;
  readonly targetProviderMangaId: string;
}): string {
  return item.targetProviderTitle !== undefined
    ? `${item.targetProviderTitle} (${item.targetProviderMangaId})`
    : item.targetProviderMangaId;
}

function confidenceVariant(band: MigrationConfidenceBand) {
  if (band === 'exact') return 'default' as const;
  if (band === 'high') return 'secondary' as const;
  return 'outline' as const;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const band = migrationConfidenceBand(confidence);
  return (
    <Badge variant={confidenceVariant(band)} title={`${Math.round(confidence * 100)}% match`}>
      {band}
    </Badge>
  );
}

function TargetSearchStatus({
  providerName,
  state,
  onRetry,
}: {
  providerName: string;
  state: MigrationTargetSearchState;
  onRetry: () => void;
}) {
  if (state.isLoading) {
    return <p className="text-xs text-muted-foreground">Searching {providerName}…</p>;
  }

  if (state.error !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (state.results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No matches on {providerName}. Enter the target id manually.
      </p>
    );
  }

  return null;
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
          <li key={item.mangaId} className="rounded-control bg-muted/40 p-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{item.canonicalTitle}</span>
              {item.blocked ? (
                <Badge variant="destructive">blocked</Badge>
              ) : (
                <Badge variant="secondary">ready</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {item.sourceProviderMangaId} → {targetMappingLabel(item)}
            </p>
            {item.issues.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {item.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.message}`} className="text-muted-foreground">
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

function ProviderSection({
  providers,
  sourceProviderId,
  targetProviderId,
  onSourceProviderChange,
  onTargetProviderChange,
}: {
  providers: readonly MigrationProviderOption[];
  sourceProviderId: string | null;
  targetProviderId: string | null;
  onSourceProviderChange: (providerId: string) => void;
  onTargetProviderChange: (providerId: string) => void;
}) {
  return (
    <SettingsSection
      title="Providers"
      description="Choose where titles come from and where they should move."
    >
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
  );
}

function CandidateRow({
  candidate,
  targetProviderName,
  searchQuery,
  committedQuery,
  searchState,
  selectedId,
  blocked,
  onSearchQueryChange,
  onRetryTargetSearch,
  onTargetMangaIdChange,
}: {
  candidate: MigrationCandidate;
  targetProviderName: string;
  searchQuery: string;
  committedQuery: string;
  searchState: MigrationTargetSearchState;
  selectedId: string;
  blocked: boolean;
  onSearchQueryChange: (mangaId: string, query: string) => void;
  onRetryTargetSearch: (mangaId: string) => void;
  onTargetMangaIdChange: (mangaId: string, targetProviderMangaId: string) => void;
}) {
  const isStale = searchQuery.trim() !== committedQuery.trim();
  // Results belong to the committed query; hide them the moment the input moves
  // ahead of the debounce so an old match cannot be clicked under new text.
  const state: MigrationTargetSearchState = isStale
    ? { isLoading: true, error: null, results: [] }
    : searchState;
  const hasSelection = selectedId.length > 0;
  const canInclude = hasSelection || state.results.length > 0;

  return (
    <li key={candidate.mangaId} className="rounded-control bg-muted/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{candidate.canonicalTitle}</span>
        {candidate.isDefaultProvider ? <Badge variant="secondary">default</Badge> : null}
        {candidate.isActiveProvider ? <Badge variant="secondary">active</Badge> : null}
        {blocked ? <Badge variant="destructive">blocked</Badge> : null}
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            checked={hasSelection}
            disabled={blocked || !canInclude}
            aria-label={`Include ${candidate.canonicalTitle} in migration`}
            onChange={(event) => {
              const best = state.results[0];
              if (event.target.checked && best !== undefined) {
                onTargetMangaIdChange(candidate.mangaId, best.providerMangaId);
                return;
              }
              onTargetMangaIdChange(candidate.mangaId, '');
            }}
          />
          Include
        </label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Source id: {candidate.sourceProviderMangaId}
      </p>

      <div className="space-y-2">
        <Label htmlFor={`search-${candidate.mangaId}`}>Search on {targetProviderName}</Label>
        <Input
          id={`search-${candidate.mangaId}`}
          value={searchQuery}
          placeholder={`Search ${targetProviderName} by title`}
          aria-label={`Target search for ${candidate.canonicalTitle}`}
          onChange={(event) => onSearchQueryChange(candidate.mangaId, event.target.value)}
        />
        <TargetSearchStatus
          providerName={targetProviderName}
          state={state}
          onRetry={() => onRetryTargetSearch(candidate.mangaId)}
        />
        <ul className="space-y-2" aria-label={`Target matches for ${candidate.canonicalTitle}`}>
          {state.results.map((result) => {
            const isSelected = selectedId === result.providerMangaId;
            return (
              <li key={result.providerMangaId}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  className={`flex w-full flex-wrap items-center gap-2 rounded-control border p-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                  onClick={() => onTargetMangaIdChange(candidate.mangaId, result.providerMangaId)}
                >
                  <span className="font-medium">{result.title}</span>
                  <ConfidenceBadge confidence={result.confidence} />
                  <span className="text-xs text-muted-foreground">{result.providerMangaId}</span>
                  {isSelected ? <Badge variant="secondary">selected</Badge> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="space-y-2">
          <Label htmlFor={`target-${candidate.mangaId}`}>Target provider manga id</Label>
          <Input
            id={`target-${candidate.mangaId}`}
            value={selectedId}
            onChange={(event) => onTargetMangaIdChange(candidate.mangaId, event.target.value)}
            placeholder="Select a match or enter an id"
          />
        </div>
      </div>
    </li>
  );
}

function CandidateSection({
  candidates,
  selections,
  searchQueries,
  committedSearchQueries,
  targetSearches,
  preview,
  targetProviderName,
  isPreviewing,
  isApplying,
  canPreview,
  hasPreview,
  onSearchQueryChange,
  onRetryTargetSearch,
  onTargetMangaIdChange,
  onSelectAllMatched,
  onDeselectAll,
  onPreview,
  onClearPreview,
}: {
  candidates: readonly MigrationCandidate[];
  selections: Readonly<Record<string, string>>;
  searchQueries: Readonly<Record<string, string>>;
  committedSearchQueries: Readonly<Record<string, string>>;
  targetSearches: Readonly<Record<string, MigrationTargetSearchState>>;
  preview: MigrationPreviewReport | null;
  targetProviderName: string;
  isPreviewing: boolean;
  isApplying: boolean;
  canPreview: boolean;
  hasPreview: boolean;
  onSearchQueryChange: (mangaId: string, query: string) => void;
  onRetryTargetSearch: (mangaId: string) => void;
  onTargetMangaIdChange: (mangaId: string, targetProviderMangaId: string) => void;
  onSelectAllMatched: () => void;
  onDeselectAll: () => void;
  onPreview: () => void;
  onClearPreview: () => void;
}) {
  const [hideBlocked, setHideBlocked] = useState(false);

  const blockedMangaIds = useMemo(() => {
    return new Set(
      (preview?.items ?? []).filter((item) => item.blocked).map((item) => String(item.mangaId)),
    );
  }, [preview]);

  const resultsByMangaId = useMemo(() => {
    const map: Record<string, readonly MigrationSearchResult[]> = {};
    for (const candidate of candidates) {
      map[candidate.mangaId] = targetSearches[candidate.mangaId]?.results ?? [];
    }
    return map;
  }, [candidates, targetSearches]);

  const summary = summarizeMigrationBatch({
    candidates,
    selections,
    resultsByMangaId,
    blockedMangaIds,
  });

  const visibleCandidates = hideBlocked
    ? candidates.filter((candidate) => !blockedMangaIds.has(candidate.mangaId))
    : candidates;

  return (
    <SettingsSection
      title="Library titles"
      description="Search the target provider for each title, review the match, then choose what to migrate."
    >
      <Alert className="mb-4">
        <AlertTitle>Downloaded chapters may not migrate</AlertTitle>
        <AlertDescription>
          Cached or downloaded chapter files and provider-specific data stay with the source
          provider. Export a backup before a large migration.
        </AlertDescription>
      </Alert>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No library titles are linked to the selected source provider.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={onSelectAllMatched}>
                Select all matched
              </Button>
              <Button size="sm" variant="ghost" onClick={onDeselectAll}>
                Deselect all
              </Button>
              {preview !== null ? (
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border accent-primary"
                    checked={hideBlocked}
                    onChange={(event) => setHideBlocked(event.target.checked)}
                  />
                  Hide blocked
                </label>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {summary.selectedCount} of {summary.totalCount} selected · {summary.matchedCount} with
              matches · {summary.blockedCount} blocked
            </p>
          </div>

          <ul className="space-y-3" aria-label="Migration candidates">
            {visibleCandidates.map((candidate) => (
              <CandidateRow
                key={candidate.mangaId}
                candidate={candidate}
                targetProviderName={targetProviderName}
                searchQuery={searchQueries[candidate.mangaId] ?? candidate.canonicalTitle}
                committedQuery={
                  committedSearchQueries[candidate.mangaId] ?? candidate.canonicalTitle
                }
                searchState={
                  targetSearches[candidate.mangaId] ?? {
                    isLoading: false,
                    error: null,
                    results: [],
                  }
                }
                selectedId={(selections[candidate.mangaId] ?? '').trim()}
                blocked={blockedMangaIds.has(candidate.mangaId)}
                onSearchQueryChange={onSearchQueryChange}
                onRetryTargetSearch={onRetryTargetSearch}
                onTargetMangaIdChange={onTargetMangaIdChange}
              />
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onPreview} disabled={!canPreview || isPreviewing || isApplying}>
          {isPreviewing ? 'Previewing…' : 'Preview migration'}
        </Button>
        {hasPreview ? (
          <Button variant="outline" onClick={onClearPreview} disabled={isPreviewing || isApplying}>
            Clear preview
          </Button>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function ReviewSection({
  preview,
  isPreviewing,
  isApplying,
  onRequestApply,
}: {
  preview: MigrationPreviewReport;
  isPreviewing: boolean;
  isApplying: boolean;
  onRequestApply: () => void;
}) {
  return (
    <SettingsSection title="Review" description="Confirm warnings before applying migration.">
      <PreviewIssueList preview={preview} />
      <div className="mt-4">
        <Button
          onClick={onRequestApply}
          disabled={!summarizeMigrationPreview(preview).canApply || isPreviewing || isApplying}
        >
          Review and apply
        </Button>
      </div>
    </SettingsSection>
  );
}

function SummaryDialog({
  open,
  onOpenChange,
  preview,
  isApplying,
  onOpenBackup,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: MigrationPreviewReport | null;
  isApplying: boolean;
  onOpenBackup: () => void;
  onConfirm: () => void;
}) {
  const readyItems = preview?.items.filter((item) => !item.blocked) ?? [];
  const blockedItems = preview?.items.filter((item) => item.blocked) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review migration</DialogTitle>
          <DialogDescription>
            {readyItems.length} title(s) will be mapped. {blockedItems.length} will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTitle>Back up first</AlertTitle>
            <AlertDescription>
              Migration cannot be undone once the target mappings change again. Export a backup
              before applying.
              <Button className="mt-3" variant="outline" size="sm" onClick={onOpenBackup}>
                Open backup
              </Button>
            </AlertDescription>
          </Alert>

          <section aria-label="Selected mappings">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Selected mappings ({readyItems.length})
            </h3>
            <ul className="space-y-1 text-sm">
              {readyItems.map((item) => (
                <li key={item.mangaId} className="rounded-control bg-muted/40 p-2">
                  <span className="font-medium">{item.canonicalTitle}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.sourceProviderMangaId} → {targetMappingLabel(item)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {blockedItems.length > 0 ? (
            <section aria-label="Blocked mappings">
              <h3 className="mb-2 text-sm font-medium text-foreground">
                Blocked or skipped ({blockedItems.length})
              </h3>
              <ul className="space-y-1 text-sm">
                {blockedItems.map((item) => (
                  <li key={item.mangaId} className="rounded-control bg-muted/40 p-2">
                    <span className="font-medium">{item.canonicalTitle}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.issues.find((issue) => issue.severity === 'error')?.message ??
                        'Not eligible for migration.'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <section aria-label="Preserved data">
              <h3 className="mb-2 text-sm font-medium text-foreground">Preserved</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {PRESERVED_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section aria-label="Not migrated data">
              <h3 className="mb-2 text-sm font-medium text-foreground">Not migrated</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {NOT_MIGRATED_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isApplying || readyItems.length === 0}>
            {isApplying ? 'Applying…' : 'Confirm migration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RollbackStatus({
  summary,
  error,
}: {
  summary: MigrationRollbackSummary | null;
  error: string | null;
}) {
  if (summary === null && error === null) return null;

  return (
    <>
      {summary !== null ? (
        <Alert>
          <AlertTitle>Migration undone</AlertTitle>
          <AlertDescription>
            {summary.restoredCount} title(s) restored.
            {summary.alreadyRestoredCount > 0
              ? ` ${summary.alreadyRestoredCount} already matched the previous state.`
              : ''}
            {summary.skippedCount > 0 ? ` ${summary.skippedCount} could not be restored.` : ''}
          </AlertDescription>
          {summary.skipped.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {summary.skipped.map((item) => (
                <li key={item.mangaId}>
                  {item.title}: {item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      {error !== null ? (
        <Alert variant="destructive">
          <AlertTitle>Undo unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function ApplyReportPanel({
  applyReport,
  applyError,
  canRollback,
  isRollingBack,
  rollbackSummary,
  rollbackError,
  onRollback,
  onDismissApplyStatus,
}: {
  applyReport: MigrationApplyReportView | null;
  applyError: string | null;
  canRollback: boolean;
  isRollingBack: boolean;
  rollbackSummary: MigrationRollbackSummary | null;
  rollbackError: string | null;
  onRollback: () => void;
  onDismissApplyStatus: () => void;
}) {
  if (applyReport === null && applyError === null) return null;

  return (
    <section aria-label="Migration report" className="space-y-3">
      {applyReport !== null ? (
        <Alert>
          <AlertTitle>Migration applied</AlertTitle>
          <AlertDescription>
            {applyReport.appliedCount} title(s) migrated. {applyReport.skippedCount} skipped.
          </AlertDescription>
        </Alert>
      ) : null}

      {applyError !== null ? (
        <Alert variant="destructive">
          <AlertTitle>Migration failed</AlertTitle>
          <AlertDescription>{applyError}</AlertDescription>
        </Alert>
      ) : null}

      {applyReport !== null ? (
        <ul className="space-y-2" aria-label="Migration report items">
          {applyReport.items.map((item) => (
            <li
              key={`${item.mangaId}-${item.status}`}
              className="rounded-control bg-muted/40 p-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.status === 'applied' ? 'secondary' : 'destructive'}>
                  {item.status}
                </Badge>
                <span className="font-medium">{item.title}</span>
              </div>
              {item.reason !== undefined ? (
                <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <RollbackStatus summary={rollbackSummary} error={rollbackError} />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={onRollback} disabled={!canRollback || isRollingBack}>
          {isRollingBack ? 'Undoing…' : 'Undo this migration'}
        </Button>
        {!canRollback && rollbackSummary === null ? (
          <p className="text-xs text-muted-foreground">
            Undo is only available until these mappings change again.
          </p>
        ) : null}
        <Button variant="ghost" onClick={onDismissApplyStatus}>
          Dismiss
        </Button>
      </div>
    </section>
  );
}

function HistorySection({
  history,
  titleFor,
}: {
  history: readonly MigrationHistoryEntry[];
  titleFor: (mangaId: string) => string;
}) {
  return (
    <SettingsSection
      title="Recent migrations"
      description="Applied migrations recorded in the local database."
    >
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No migrations recorded yet.</p>
      ) : (
        <ul className="space-y-2" aria-label="Migration history">
          {history.map((entry) => (
            <li key={entry.id} className="rounded-control bg-muted/40 p-2 text-sm">
              <span className="font-medium">{entry.canonicalTitle ?? titleFor(entry.mangaId)}</span>
              <span className="block text-xs text-muted-foreground">
                {entry.sourceProviderId} → {entry.targetProviderId} ·{' '}
                {new Date(entry.completedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function RequestedTitleList({
  mangaIds,
  titles,
}: {
  mangaIds: readonly string[];
  titles: Readonly<Record<string, string>>;
}) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" aria-label="Skipped selected titles">
      {mangaIds.map((mangaId) => (
        <li key={mangaId}>{titles[mangaId] ?? mangaId}</li>
      ))}
    </ul>
  );
}

function SelectionHandoffNotice({
  requestedMangaIds,
  requestedSourceProviderIds,
  sourceProviderId,
  providers,
}: {
  requestedMangaIds: readonly string[];
  requestedSourceProviderIds: readonly string[];
  sourceProviderId: string | null;
  providers: readonly MigrationProviderOption[];
}) {
  if (requestedMangaIds.length === 0) return null;

  const nameFor = (providerId: string) =>
    providers.find((provider) => provider.id === providerId)?.name ?? providerId;
  const sourceNames = requestedSourceProviderIds.map(nameFor);
  const selectedName = sourceProviderId === null ? undefined : nameFor(sourceProviderId);

  if (sourceNames.length > 1) {
    return (
      <Alert>
        <AlertTitle>Multiple source providers in this selection</AlertTitle>
        <AlertDescription>
          This batch groups titles by their preferred provider mapping across{' '}
          {sourceNames.join(', ')}. Migration works one source mapping at a time: choose the
          provider whose mappings you want to migrate. Titles without a mapping on that provider are
          skipped and listed below.
          {selectedName !== undefined ? ` Showing ${selectedName}.` : ''}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertTitle>Library selection</AlertTitle>
      <AlertDescription>
        {requestedMangaIds.length} selected {requestedMangaIds.length === 1 ? 'title' : 'titles'}
        {sourceNames.length === 1 ? ` with a mapping on ${sourceNames[0]}` : ''}. Only mappings for
        this batch are offered.
      </AlertDescription>
    </Alert>
  );
}

function UnavailableSourceNotice({
  providerId,
  requestedMangaIds,
  requestedTitles,
}: {
  providerId: string;
  requestedMangaIds: readonly string[];
  requestedTitles: Readonly<Record<string, string>>;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Selected source provider is unavailable</AlertTitle>
      <AlertDescription>
        {providerId} is not installed or enabled, so the {requestedMangaIds.length} selected{' '}
        {requestedMangaIds.length === 1 ? 'title' : 'titles'} cannot be migrated from it. Install or
        enable the provider, choose another source, or start again from the library.
      </AlertDescription>
      <RequestedTitleList mangaIds={requestedMangaIds} titles={requestedTitles} />
    </Alert>
  );
}

function SkippedSelectionNotice({
  skippedRequestedIds,
  requestedTitles,
  sourceProviderName,
}: {
  skippedRequestedIds: readonly string[];
  requestedTitles: Readonly<Record<string, string>>;
  sourceProviderName: string;
}) {
  if (skippedRequestedIds.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>Some selected titles were skipped</AlertTitle>
      <AlertDescription>
        {skippedRequestedIds.length} {skippedRequestedIds.length === 1 ? 'title is' : 'titles are'}{' '}
        no longer in the library or have no mapping on {sourceProviderName}.
      </AlertDescription>
      <RequestedTitleList mangaIds={skippedRequestedIds} titles={requestedTitles} />
    </Alert>
  );
}

function HandoffErrorNotice({
  error,
  idCount,
  onClearHandoff,
}: {
  error: MigrationHandoffError;
  idCount?: number;
  onClearHandoff?: () => void;
}) {
  const tooMany = error === 'too-many';

  return (
    <Alert variant="destructive">
      <AlertTitle>
        {tooMany ? 'Too many titles for one migration batch' : 'Invalid migration link'}
      </AlertTitle>
      <AlertDescription>
        {tooMany
          ? `This link carries ${idCount ?? 'too many'} titles; one batch accepts at most ${MIGRATION_BATCH_LIMIT}. Reduce the selection in the library and try again.`
          : 'The title list in this link could not be read, so no batch was loaded. Return to the library and choose Migrate selected again.'}
      </AlertDescription>
      {onClearHandoff !== undefined ? (
        <Button className="mt-3" variant="outline" size="sm" onClick={onClearHandoff}>
          Clear this link
        </Button>
      ) : null}
    </Alert>
  );
}

function HandoffSection({
  handoffError,
  handoffIdCount,
  onClearHandoff,
  requestedMangaIds,
  requestedSourceProviderIds,
  skippedRequestedIds,
  requestedTitles,
  unavailableRequestedSourceProviderId,
  providers,
  sourceProviderId,
  targetProviderId,
  onSourceProviderChange,
  onTargetProviderChange,
  children,
}: {
  handoffError: MigrationHandoffError | undefined;
  handoffIdCount: number | undefined;
  onClearHandoff: (() => void) | undefined;
  requestedMangaIds: readonly string[];
  requestedSourceProviderIds: readonly string[];
  skippedRequestedIds: readonly string[];
  requestedTitles: Readonly<Record<string, string>>;
  unavailableRequestedSourceProviderId: string | null;
  providers: readonly MigrationProviderOption[];
  sourceProviderId: string | null;
  targetProviderId: string | null;
  onSourceProviderChange: (providerId: string) => void;
  onTargetProviderChange: (providerId: string) => void;
  children: ReactNode;
}) {
  if (handoffError !== undefined) {
    return (
      <HandoffErrorNotice
        error={handoffError}
        {...(handoffIdCount === undefined ? {} : { idCount: handoffIdCount })}
        {...(onClearHandoff === undefined ? {} : { onClearHandoff })}
      />
    );
  }

  return (
    <>
      <SelectionHandoffNotice
        requestedMangaIds={requestedMangaIds}
        requestedSourceProviderIds={requestedSourceProviderIds}
        sourceProviderId={sourceProviderId}
        providers={providers}
      />

      <ProviderSection
        providers={providers}
        sourceProviderId={sourceProviderId}
        targetProviderId={targetProviderId}
        onSourceProviderChange={onSourceProviderChange}
        onTargetProviderChange={onTargetProviderChange}
      />

      {unavailableRequestedSourceProviderId !== null ? (
        <UnavailableSourceNotice
          providerId={unavailableRequestedSourceProviderId}
          requestedMangaIds={requestedMangaIds}
          requestedTitles={requestedTitles}
        />
      ) : (
        <SkippedSelectionNotice
          skippedRequestedIds={skippedRequestedIds}
          requestedTitles={requestedTitles}
          sourceProviderName={
            providers.find((provider) => provider.id === sourceProviderId)?.name ??
            'the selected source provider'
          }
        />
      )}

      {children}
    </>
  );
}

export function MigrationPage({
  isLoading,
  isError,
  isPreviewing = false,
  isApplying = false,
  isRollingBack = false,
  providers,
  candidates,
  sourceProviderId,
  targetProviderId,
  selections,
  searchQueries,
  committedSearchQueries,
  targetSearches,
  preview,
  applyReport,
  applyError,
  canRollback,
  rollbackSummary,
  rollbackError,
  history,
  requestedMangaIds = EMPTY_REQUESTED_IDS,
  requestedSourceProviderIds = EMPTY_REQUESTED_IDS,
  skippedRequestedIds = EMPTY_REQUESTED_IDS,
  requestedTitles = EMPTY_REQUESTED_TITLES,
  unavailableRequestedSourceProviderId = null,
  handoffError,
  handoffIdCount,
  onSourceProviderChange,
  onTargetProviderChange,
  onTargetMangaIdChange,
  onSearchQueryChange,
  onRetryTargetSearch,
  onSelectAllMatched,
  onDeselectAll,
  onPreview,
  onApply,
  onClearPreview,
  onDismissApplyStatus,
  onRollback,
  onOpenBackup,
  onClearHandoff,
}: MigrationPageProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const titlesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const candidate of candidates) map[candidate.mangaId] = candidate.canonicalTitle;
    return map;
  }, [candidates]);

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

  const showCandidates =
    sourceProviderId !== null && targetProviderId !== null && sourceProviderId !== targetProviderId;
  const targetProviderName =
    providers.find((provider) => provider.id === targetProviderId)?.name ?? 'the target provider';

  if (isLoading) {
    return (
      <section aria-label="Migration" className="mx-auto w-full max-w-3xl p-6">
        <LoadingState type="list" />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label="Migration" className="mx-auto w-full max-w-3xl p-6">
        <ErrorState
          title="Migration unavailable"
          message="Local database is not ready. Try again after the app finishes initializing."
        />
      </section>
    );
  }

  return (
    <section aria-label="Migration" className="mx-auto w-full max-w-3xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Migration</h1>
        <p className="text-sm text-muted-foreground">
          Move library titles from one provider to another. Review matches before applying changes.
        </p>
      </header>

      <ApplyReportPanel
        applyReport={applyReport}
        applyError={applyError}
        canRollback={canRollback}
        isRollingBack={isRollingBack}
        rollbackSummary={rollbackSummary}
        rollbackError={rollbackError}
        onRollback={onRollback}
        onDismissApplyStatus={onDismissApplyStatus}
      />

      <HandoffSection
        handoffError={handoffError}
        handoffIdCount={handoffIdCount}
        onClearHandoff={onClearHandoff}
        requestedMangaIds={requestedMangaIds}
        requestedSourceProviderIds={requestedSourceProviderIds}
        skippedRequestedIds={skippedRequestedIds}
        requestedTitles={requestedTitles}
        unavailableRequestedSourceProviderId={unavailableRequestedSourceProviderId}
        providers={providers}
        sourceProviderId={sourceProviderId}
        targetProviderId={targetProviderId}
        onSourceProviderChange={onSourceProviderChange}
        onTargetProviderChange={onTargetProviderChange}
      >
        {showCandidates ? (
          <CandidateSection
            candidates={candidates}
            selections={selections}
            searchQueries={searchQueries}
            committedSearchQueries={committedSearchQueries}
            targetSearches={targetSearches}
            preview={preview}
            targetProviderName={targetProviderName}
            isPreviewing={isPreviewing}
            isApplying={isApplying}
            canPreview={canPreview}
            hasPreview={preview !== null}
            onSearchQueryChange={onSearchQueryChange}
            onRetryTargetSearch={onRetryTargetSearch}
            onTargetMangaIdChange={onTargetMangaIdChange}
            onSelectAllMatched={onSelectAllMatched}
            onDeselectAll={onDeselectAll}
            onPreview={onPreview}
            onClearPreview={onClearPreview}
          />
        ) : null}

        {preview !== null ? (
          <ReviewSection
            preview={preview}
            isPreviewing={isPreviewing}
            isApplying={isApplying}
            onRequestApply={() => setConfirmOpen(true)}
          />
        ) : null}
      </HandoffSection>

      <HistorySection history={history} titleFor={(mangaId) => titlesById[mangaId] ?? mangaId} />

      <SummaryDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        preview={preview}
        isApplying={isApplying}
        onOpenBackup={onOpenBackup}
        onConfirm={() => {
          setConfirmOpen(false);
          onApply();
        }}
      />
    </section>
  );
}
