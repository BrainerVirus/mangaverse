import { useState } from 'react';
import {
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
} from '@app/design-system';
import type { MergePreview, UnmergeMappingPreview } from '@app/db';
import {
  errorMessage,
  libraryStatusLabel,
  providerDisplayName,
  toMangaId,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import { ArrowRightLeft } from 'lucide-react';
import type { DuplicateCandidate } from '../duplicate-candidates.js';

export interface DuplicateCandidatesState {
  readonly items?: readonly DuplicateCandidate[];
  readonly isLoading?: boolean;
  readonly error?: string;
  onRetry?: () => void;
}

export interface MergeDuplicateInput {
  readonly targetId: MangaId;
  readonly sourceId: MangaId;
}

export interface MangaDuplicatesSectionProps {
  readonly currentMangaId: MangaId;
  readonly providerLabels?: Readonly<Record<string, string>>;
  readonly state?: DuplicateCandidatesState;
  readonly isPending?: boolean;
  loadPreview?: (targetId: MangaId, sourceId: MangaId) => Promise<MergePreview>;
  onMerge?: (input: MergeDuplicateInput) => Promise<void>;
  /** Lets the route follow the merge when the duplicate becomes the kept title. */
  onMerged?: (targetId: MangaId) => void;
}

interface MergeSelection {
  readonly candidate: DuplicateCandidate;
  readonly targetId: MangaId;
}

function providerNames(
  providerIds: readonly string[],
  providerLabels: Readonly<Record<string, string>> | undefined,
): string {
  return providerIds
    .map((providerId) => providerDisplayName(providerId, providerLabels))
    .filter((label): label is string => label !== undefined)
    .join(', ');
}

function issueTone(severity: 'info' | 'warning' | 'error'): string {
  if (severity === 'error') return 'text-destructive';
  return severity === 'warning' ? 'text-foreground' : 'text-muted-foreground';
}

function MergeSideFacts({
  side,
  heading,
  providerLabels,
}: {
  readonly side: MergePreview['target'];
  readonly heading: string;
  providerLabels: Readonly<Record<string, string>> | undefined;
}) {
  return (
    <section aria-label={heading} className="min-w-0 rounded-box border border-border p-4">
      <h3 className="truncate text-base font-semibold">{side.canonicalTitle}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {providerNames(side.providerIds, providerLabels)} · {side.mappingCount}{' '}
        {side.mappingCount === 1 ? 'source' : 'sources'} · {side.chapterCount}{' '}
        {side.chapterCount === 1 ? 'chapter' : 'chapters'} · {side.readChapterCount} read
      </p>
      <dl className="mt-3 grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium text-muted-foreground">Library</dt>
          <dd>
            {side.libraryEntry === undefined
              ? 'Not in library'
              : `${libraryStatusLabel(side.libraryEntry.status)}${
                  side.libraryEntry.favorite ? ' · Favorite' : ''
                } · ${side.libraryEntry.categoryIds.length} ${
                  side.libraryEntry.categoryIds.length === 1 ? 'category' : 'categories'
                }`}
          </dd>
        </div>
        {side.libraryEntry?.progressPercent !== undefined ? (
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground">Progress</dt>
            <dd>{Math.round(side.libraryEntry.progressPercent)}%</dd>
          </div>
        ) : null}
        {side.libraryEntry?.lastReadChapterId !== undefined ? (
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground">Last read</dt>
            <dd className="truncate">{side.libraryEntry.lastReadChapterId}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="font-medium text-muted-foreground">Tracking</dt>
          <dd>{side.trackingLinks !== undefined ? side.trackingLinks.join(', ') : 'None'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-muted-foreground">Override</dt>
          <dd>{side.hasUserOverrides ? 'Custom cover or metadata' : 'None'}</dd>
        </div>
        {side.coverImageUrl !== undefined ? (
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground">Cover</dt>
            <dd className="truncate text-xs">{side.coverImageUrl}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function MergeMappingList({
  preview,
  providerLabels,
}: {
  readonly preview: MergePreview;
  providerLabels: Readonly<Record<string, string>> | undefined;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">Provider sources</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {preview.mappings.map((mapping) => (
          <li
            key={mapping.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              {providerDisplayName(mapping.providerId, providerLabels) !== undefined ? (
                <span className="font-medium">
                  {providerDisplayName(mapping.providerId, providerLabels)}
                </span>
              ) : null}{' '}
              <span className="truncate text-xs text-muted-foreground">
                {mapping.providerMangaId}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {mapping.isTargetDefault || mapping.isSourceDefault ? (
                <Badge variant="secondary">Default</Badge>
              ) : null}
              {mapping.isTargetPreferred || mapping.isSourcePreferred ? (
                <Badge variant="outline">Chapter source</Badge>
              ) : null}
              <Badge variant={mapping.action === 'dedupe' ? 'destructive' : 'outline'}>
                {mapping.action === 'dedupe' ? 'Duplicate removed' : 'Moves in'}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MergePreviewBody({
  preview,
  providerLabels,
  targetId,
}: {
  readonly preview: MergePreview;
  providerLabels: Readonly<Record<string, string>> | undefined;
  readonly targetId: MangaId;
}) {
  const target = targetId === preview.target.mangaId ? preview.target : preview.source;
  const source = targetId === preview.target.mangaId ? preview.source : preview.target;
  const mappingLabel = (mappingId: ProviderMappingId | undefined): string => {
    const mapping = preview.mappings.find((item) => item.id === mappingId);
    return mapping === undefined
      ? 'None'
      : (providerDisplayName(mapping.providerId, providerLabels) ?? mapping.providerMangaId);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <MergeSideFacts side={target} heading="Kept title" providerLabels={providerLabels} />
        <MergeSideFacts side={source} heading="Merged title" providerLabels={providerLabels} />
      </div>
      <MergeMappingList preview={preview} providerLabels={providerLabels} />
      <div className="grid gap-1 text-sm">
        <p className="text-muted-foreground">
          Default source: {mappingLabel(preview.resultDefaultMappingId)} · Chapter source:{' '}
          {mappingLabel(preview.resultPreferredMappingId)}
        </p>
        <p className="text-muted-foreground">
          {preview.duplicateMappingCount === 0 && preview.duplicateChapterCount === 0
            ? 'Provider sources and chapters are combined without duplicates.'
            : `${preview.duplicateMappingCount} duplicate ${
                preview.duplicateMappingCount === 1 ? 'source' : 'sources'
              } and ${preview.duplicateChapterCount} duplicate ${
                preview.duplicateChapterCount === 1 ? 'chapter' : 'chapters'
              } are collapsed.`}
        </p>
        <p className="text-muted-foreground">
          Library categories are combined; favorite and status follow the newest edit, reading
          progress follows the latest read.
        </p>
      </div>
      {preview.issues.length === 0 ? null : (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Merge warnings">
          {preview.issues.map((issue) => (
            <li key={issue.code} className={issueTone(issue.severity)}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DuplicatesList({
  state,
  providerLabels,
  canMerge,
  onMerge,
}: {
  readonly state: DuplicateCandidatesState;
  providerLabels: Readonly<Record<string, string>> | undefined;
  readonly canMerge: boolean;
  onMerge: (candidate: DuplicateCandidate) => void;
}) {
  if (state.isLoading) return <LoadingState type="list" count={2} />;
  if (state.error !== undefined) {
    return (
      <ErrorState
        title="Could not check for duplicates"
        message={state.error}
        {...(state.onRetry === undefined ? {} : { onRetry: state.onRetry })}
      />
    );
  }
  const items = state.items ?? [];
  if (items.length === 0) {
    return (
      <p className="rounded-box border border-border px-4 py-3 text-sm text-muted-foreground">
        No possible duplicates found.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((candidate) => (
        <li
          key={candidate.mangaId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-box border border-border px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{candidate.canonicalTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {providerNames(candidate.providerIds, providerLabels)} ·{' '}
              {Math.round(candidate.score * 100)}% match
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canMerge}
            onClick={() => onMerge(candidate)}
          >
            <ArrowRightLeft aria-hidden className="size-4" />
            Merge
          </Button>
        </li>
      ))}
    </ul>
  );
}

function useMergePreview(
  loadPreview: ((targetId: MangaId, sourceId: MangaId) => Promise<MergePreview>) | undefined,
) {
  const [preview, setPreview] = useState<MergePreview | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function load(targetId: MangaId, sourceId: MangaId): Promise<void> {
    if (loadPreview === undefined) {
      setError('Merge preview is unavailable.');
      return;
    }
    setPreview(undefined);
    setError(undefined);
    setIsLoading(true);
    try {
      setPreview(await loadPreview(targetId, sourceId));
    } catch (caught) {
      setError(errorMessage(caught, 'Could not build the merge preview.'));
    } finally {
      setIsLoading(false);
    }
  }

  function reset(): void {
    setPreview(undefined);
    setError(undefined);
  }

  return { preview, isLoading, error, load, reset };
}

interface MergeDialogProps {
  readonly currentMangaId: MangaId;
  readonly providerLabels?: Readonly<Record<string, string>> | undefined;
  readonly selection?: MergeSelection;
  readonly preview?: MergePreview;
  readonly previewError?: string;
  readonly isLoadingPreview: boolean;
  readonly isPending: boolean;
  onClose: () => void;
  onSelectTarget: (targetId: MangaId) => void;
  onConfirm: (input: MergeDuplicateInput) => Promise<void>;
  onMerged?: ((targetId: MangaId) => void) | undefined;
}

function MergeDialogBody({
  currentMangaId,
  providerLabels,
  selection,
  preview,
  previewError,
  isLoadingPreview,
  applyError,
  onSelectTarget,
}: {
  readonly currentMangaId: MangaId;
  readonly providerLabels: Readonly<Record<string, string>> | undefined;
  readonly selection: MergeSelection;
  readonly preview: MergePreview | undefined;
  readonly previewError: string | undefined;
  readonly isLoadingPreview: boolean;
  readonly applyError: string | undefined;
  onSelectTarget: (targetId: MangaId) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="merge-keep-title" className="text-sm font-medium">
          Keep title
        </label>
        <Select
          value={selection.targetId}
          onValueChange={(value) => onSelectTarget(toMangaId(value))}
          disabled={isLoadingPreview}
        >
          <SelectTrigger id="merge-keep-title" className="h-9 w-72" aria-label="Keep title">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={currentMangaId}>This title</SelectItem>
            <SelectItem value={selection.candidate.mangaId}>
              {selection.candidate.canonicalTitle}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoadingPreview ? (
        <LoadingState type="detail" />
      ) : previewError !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          {previewError}
        </p>
      ) : preview === undefined ? null : (
        <MergePreviewBody
          preview={preview}
          providerLabels={providerLabels}
          targetId={selection.targetId}
        />
      )}

      {applyError === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {applyError}
        </p>
      )}
    </div>
  );
}

function MergeDialog({
  currentMangaId,
  providerLabels,
  selection,
  preview,
  previewError,
  isLoadingPreview,
  isPending,
  onClose,
  onSelectTarget,
  onConfirm,
  onMerged,
}: MergeDialogProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | undefined>();
  const busy = isApplying || isPending || isLoadingPreview;
  const canConfirm = preview?.canMerge === true && !busy && previewError === undefined;

  // The dialog stays mounted between openings, so a failed attempt from the
  // last time must not greet the next one.
  function close(): void {
    setApplyError(undefined);
    onClose();
  }

  async function confirm(): Promise<void> {
    if (selection === undefined) return;
    const sourceId =
      selection.targetId === currentMangaId ? selection.candidate.mangaId : currentMangaId;
    setIsApplying(true);
    setApplyError(undefined);
    try {
      await onConfirm({ targetId: selection.targetId, sourceId });
      const mergedTargetId = selection.targetId;
      onClose();
      onMerged?.(mergedTargetId);
    } catch (caught) {
      setApplyError(errorMessage(caught, 'Could not merge the titles.'));
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Dialog
      open={selection !== undefined}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Merge duplicates</DialogTitle>
          <DialogDescription>
            Review both titles before merging. The kept title receives every provider source,
            chapter, reading-progress row and library detail. Nothing changes until you confirm.
          </DialogDescription>
        </DialogHeader>

        {selection === undefined ? null : (
          <MergeDialogBody
            currentMangaId={currentMangaId}
            providerLabels={providerLabels}
            selection={selection}
            preview={preview}
            previewError={previewError}
            isLoadingPreview={isLoadingPreview}
            applyError={applyError}
            onSelectTarget={onSelectTarget}
          />
        )}

        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="outline" disabled={isApplying} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={() => void confirm()}>
            {isApplying || isPending ? 'Merging…' : 'Merge titles'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MangaDuplicatesSection({
  currentMangaId,
  providerLabels,
  state,
  isPending = false,
  loadPreview,
  onMerge,
  onMerged,
}: MangaDuplicatesSectionProps) {
  const [selection, setSelection] = useState<MergeSelection | undefined>();
  const previewState = useMergePreview(loadPreview);
  if (state === undefined) return null;

  function openMerge(candidate: DuplicateCandidate): void {
    setSelection({ candidate, targetId: currentMangaId });
    void previewState.load(currentMangaId, candidate.mangaId);
  }

  function closeMerge(): void {
    setSelection(undefined);
    previewState.reset();
  }

  function selectTarget(targetId: MangaId): void {
    if (selection === undefined || targetId === selection.targetId) return;
    const sourceId = targetId === currentMangaId ? selection.candidate.mangaId : currentMangaId;
    setSelection({ candidate: selection.candidate, targetId });
    void previewState.load(targetId, sourceId);
  }

  return (
    <section aria-label="Possible duplicates" className="space-y-3">
      <SettingsSection title="Possible duplicates" collapsed>
        <DuplicatesList
          state={state}
          providerLabels={providerLabels}
          canMerge={onMerge !== undefined && !isPending}
          onMerge={openMerge}
        />
      </SettingsSection>
      <MergeDialog
        currentMangaId={currentMangaId}
        providerLabels={providerLabels}
        {...(selection === undefined ? {} : { selection })}
        {...(previewState.preview === undefined ? {} : { preview: previewState.preview })}
        {...(previewState.error === undefined ? {} : { previewError: previewState.error })}
        isLoadingPreview={previewState.isLoading}
        isPending={isPending}
        onClose={closeMerge}
        onSelectTarget={selectTarget}
        onConfirm={(input) => onMerge?.(input) ?? Promise.resolve()}
        {...(onMerged === undefined ? {} : { onMerged })}
      />
    </section>
  );
}

function UnmergeDialogBody({
  preview,
  isLoading,
  error,
  providerLabels,
}: {
  readonly preview: UnmergeMappingPreview | undefined;
  readonly isLoading: boolean;
  readonly error: string | undefined;
  providerLabels: Readonly<Record<string, string>> | undefined;
}) {
  if (isLoading) return <LoadingState type="detail" />;
  if (error !== undefined) {
    return (
      <p role="alert" className="text-destructive">
        {error}
      </p>
    );
  }
  if (preview === undefined) return null;
  return (
    <>
      <p>
        <span className="font-medium">
          {providerDisplayName(preview.mapping.providerId, providerLabels) ??
            preview.mapping.providerMangaId}
        </span>{' '}
        · {preview.mapping.providerMangaId}
      </p>
      <ul className="list-inside list-disc text-muted-foreground">
        <li>
          {preview.chapterCount} {preview.chapterCount === 1 ? 'chapter' : 'chapters'} and{' '}
          {preview.readChapterCount} read {preview.readChapterCount === 1 ? 'state' : 'states'}{' '}
          move.
        </li>
        <li>
          {preview.remainingMappingCount}{' '}
          {preview.remainingMappingCount === 1 ? 'source stays' : 'sources stay'} on this title.
        </li>
        <li>The new title is not added to your library automatically.</li>
      </ul>
      {preview.issues.length === 0 ? null : (
        <ul aria-label="Split warnings" className="flex flex-col gap-1">
          {preview.issues.map((issue) => (
            <li key={issue.code} className={issueTone(issue.severity)}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function useUnmergeSubmit(
  preview: UnmergeMappingPreview | undefined,
  onConfirm: (mappingId: ProviderMappingId) => Promise<void>,
  onDone: () => void,
) {
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit(): Promise<void> {
    if (preview === undefined || !preview.canUnmerge) return;
    setIsSplitting(true);
    setError(undefined);
    try {
      await onConfirm(preview.mapping.id);
      onDone();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not split the provider source.'));
    } finally {
      setIsSplitting(false);
    }
  }

  function resetError(): void {
    setError(undefined);
  }

  return { isSplitting, error, submit, resetError };
}

export interface MangaUnmergeDialogProps {
  readonly open: boolean;
  readonly preview?: UnmergeMappingPreview;
  readonly isLoading?: boolean;
  readonly error?: string;
  readonly isPending?: boolean;
  readonly providerLabels?: Readonly<Record<string, string>>;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mappingId: ProviderMappingId) => Promise<void>;
}

/** Splitting a provider source creates a new title; it always asks first. */
export function MangaUnmergeDialog({
  open,
  preview,
  isLoading = false,
  error,
  isPending = false,
  providerLabels,
  onOpenChange,
  onConfirm,
}: MangaUnmergeDialogProps) {
  const submit = useUnmergeSubmit(preview, onConfirm, () => onOpenChange(false));
  const busy = submit.isSplitting || isPending;
  // The dialog stays mounted between openings; a failed attempt from the last
  // time must not greet the next one.
  function close(): void {
    submit.resetError();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Split provider source into a new title?</DialogTitle>
          <DialogDescription>
            The selected source, its chapters and their reading progress move to a new local title.
            The original title keeps its library entry and everything else.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <UnmergeDialogBody
            preview={preview}
            isLoading={isLoading}
            error={error}
            providerLabels={providerLabels}
          />
          {submit.error === undefined ? null : (
            <p role="alert" className="text-destructive">
              {submit.error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || preview?.canUnmerge !== true}
            onClick={() => void submit.submit()}
          >
            {busy ? 'Splitting…' : 'Split source'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
