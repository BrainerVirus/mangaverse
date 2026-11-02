import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@app/design-system';
import type {
  ChapterId,
  LibraryEntryId,
  LibraryFilter,
  LibraryViewState,
  MangaId,
  ProviderId,
} from '@app/shared';
import type { LibraryItem, LibraryPageData, LibraryOrganizationAction } from '../types.js';
import type { LibraryOverviewData } from '../fetch-library-overview.js';
import {
  collectLibraryMigrationSelection,
  libraryMigrationSelectionError,
  type LibraryMigrationSelection,
} from '../migration-selection.js';
import { hasLibraryFilters } from '../view-state.js';
import { BulkEditBar } from './BulkEditBar.js';
import { LibraryToolbar } from './LibraryToolbar.js';
import {
  ContinueReadingSection,
  LibraryUpdatePanel,
  RecentlyUpdatedSection,
  type LibraryUpdatesControl,
} from './LibrarySections.js';
import { VirtualLibraryGrid } from './VirtualLibraryGrid.js';

const NOOP_ORGANIZE = async (): Promise<void> => {};
const NOOP_MIGRATE = (): void => {};

/** Validates the batch, then hands it off; a rejected batch reports instead of navigating. */
function handOffMigrationSelection(input: {
  readonly items: readonly LibraryItem[];
  readonly entryIds: readonly LibraryEntryId[];
  readonly limit: number | undefined;
  readonly onError: (error: string | null) => void;
  readonly onMigrate: (selection: LibraryMigrationSelection) => void;
}): void {
  const handoff = collectLibraryMigrationSelection(input.items, input.entryIds);
  const error = libraryMigrationSelectionError(handoff, input.limit);
  input.onError(error);
  if (error === null) input.onMigrate(handoff);
}

export interface LibraryPageProps {
  data: LibraryPageData | undefined;
  isLoading: boolean;
  isError: boolean;
  viewState: LibraryViewState;
  onViewStateChange: (next: LibraryViewState) => void;
  onOpenManga: (mangaId: MangaId) => void;
  onBrowse?: () => void;
  onRetry?: () => void;
  onOrganize?: (action: LibraryOrganizationAction) => Promise<void>;
  /** Hands the selection to the migration flow; grouped by reading provider. */
  onMigrate?: (selection: LibraryMigrationSelection) => void;
  /** Maximum titles one migration hand-off can carry; the app supplies it. */
  migrationBatchLimit?: number;
  /** Registered provider names keyed by provider id, so cards show the manifest name. */
  sourceLabels?: Readonly<Record<string, string>>;
  /** Continue reading and recently updated, already filtered like the grid. */
  overview?: LibraryOverviewData;
  onOpenChapter?: (chapterId: ChapterId) => void;
  updates?: LibraryUpdatesControl;
}

function collectProviders(items: readonly LibraryItem[]): ProviderId[] {
  const providers = new Set<ProviderId>();
  for (const item of items) {
    for (const mapping of item.manga.providerMappings) providers.add(mapping.providerId);
  }
  return [...providers].sort((a, b) => a.localeCompare(b));
}

function useLibrarySelection(items: readonly LibraryItem[]) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<LibraryEntryId>>(
    () => new Set<LibraryEntryId>(),
  );

  const toggleSelected = useCallback((entryId: LibraryEntryId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const selectedEntryIds = items
    .map((item) => item.entry.id)
    .filter((entryId) => selectedIds.has(entryId));
  const allVisibleSelected = items.length > 0 && selectedEntryIds.length === items.length;

  const selectAllVisible = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(items.map((item) => item.entry.id)));

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((current) => !current);
    setSelectedIds(new Set());
  }, []);

  return {
    selectionMode,
    selectedIds,
    selectedEntryIds,
    allVisibleSelected,
    toggleSelected,
    clearSelection,
    selectAllVisible,
    toggleSelectionMode,
  };
}

interface LibraryStatusProps {
  isLoading: boolean;
  isError: boolean;
  itemCount: number;
  filtersActive: boolean;
  onBrowse?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  onClearFilters: () => void;
}

function LibraryStatus({
  isLoading,
  isError,
  itemCount,
  filtersActive,
  onBrowse,
  onRetry,
  onClearFilters,
}: LibraryStatusProps) {
  if (isLoading) return <LoadingState type="grid" />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load library"
        message="Local data failed to load. Try again in a moment."
        {...(onRetry === undefined ? {} : { onRetry })}
      />
    );
  }
  if (itemCount > 0) return null;
  if (filtersActive) {
    return (
      <EmptyState type="no-results" action={{ label: 'Clear filters', onClick: onClearFilters }} />
    );
  }
  return (
    <EmptyState
      type="no-library"
      {...(onBrowse === undefined
        ? {}
        : { action: { label: 'Browse providers', onClick: onBrowse } })}
    />
  );
}

function LibraryUpdatesSection({
  updates,
  isLoading,
  isError,
  itemCount,
}: {
  updates: LibraryPageProps['updates'];
  isLoading: boolean;
  isError: boolean;
  itemCount: number;
}) {
  if (isLoading || isError || updates === undefined) return null;
  if (itemCount === 0 && updates.report === undefined) return null;
  return <LibraryUpdatePanel updates={updates} />;
}

export function LibraryPage({
  data,
  isLoading,
  isError,
  viewState,
  onViewStateChange,
  onOpenManga,
  onBrowse,
  onRetry,
  onOrganize,
  onMigrate = NOOP_MIGRATE,
  migrationBatchLimit,
  sourceLabels,
  overview,
  onOpenChapter,
  updates,
}: LibraryPageProps) {
  const items = data?.items ?? [];
  const itemCount = items.length;
  const categories = data?.categories ?? [];
  const providers = data?.providers ?? collectProviders(items);
  const filtersActive = hasLibraryFilters(viewState.filter);
  const selection = useLibrarySelection(items);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const { clearSelection: clearSelectedIds } = selection;
  const clearSelection = useCallback(() => {
    clearSelectedIds();
    setMigrationError(null);
  }, [clearSelectedIds]);
  const toggleSelectionMode = () => {
    setMigrationError(null);
    selection.toggleSelectionMode();
  };
  const selectionMode = selection.selectionMode;
  const exitSelectionMode = selection.toggleSelectionMode;
  const migrateSelected = () =>
    handOffMigrationSelection({
      items,
      entryIds: selection.selectedEntryIds,
      limit: migrationBatchLimit,
      onError: setMigrationError,
      onMigrate,
    });

  // Filter changes start a new result set; carrying ids from the old one would
  // let a bulk action touch titles the user can no longer see.
  const handleFilterChange = useCallback(
    (filter: LibraryFilter) => {
      clearSelection();
      onViewStateChange({ ...viewState, filter });
    },
    [clearSelection, onViewStateChange, viewState],
  );

  // Escape leaves selection mode from anywhere: the "Select titles" trigger is
  // replaced by the bulk bar, so focus falls back to <body> and a section-level
  // handler would never see the key. A dialog opened from the bar owns its own
  // Escape, so an event inside one is skipped.
  // react-doctor-disable-next-line team-conventions/no-use-effect -- ruling: web-effect-window-keydown: Escape is a window-level dismissal; the page subtree is not the focus owner once the trigger unmounts.
  useEffect(() => {
    if (!selectionMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"],[role="alertdialog"]') !== null
      ) {
        return;
      }
      setMigrationError(null);
      exitSelectionMode();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode, exitSelectionMode]);

  return (
    <section
      aria-label="Library"
      className="mx-auto flex w-full max-w-400 flex-col gap-6 p-6 md:p-8"
    >
      <LibraryToolbar
        viewState={viewState}
        itemCount={itemCount}
        categories={categories}
        providers={providers}
        onViewStateChange={onViewStateChange}
        onFilterChange={handleFilterChange}
        {...(onOrganize === undefined ? {} : { onOrganize })}
      />

      <LibraryStatus
        isLoading={isLoading}
        isError={isError}
        itemCount={itemCount}
        filtersActive={filtersActive}
        onBrowse={onBrowse}
        onRetry={onRetry}
        onClearFilters={() => handleFilterChange({})}
      />

      <LibraryUpdatesSection
        updates={updates}
        isLoading={isLoading}
        isError={isError}
        itemCount={itemCount}
      />

      {itemCount > 0 && !isLoading && !isError ? (
        <>
          {overview !== undefined ? (
            <>
              <ContinueReadingSection
                items={overview.continueReading}
                onResume={(chapterId) => onOpenChapter?.(chapterId)}
                showEmpty={!filtersActive}
              />
              <RecentlyUpdatedSection items={overview.recentlyUpdated} onOpenManga={onOpenManga} />
            </>
          ) : null}
          <BulkEditBar
            selectionMode={selection.selectionMode}
            selectedEntryIds={selection.selectedEntryIds}
            visibleCount={itemCount}
            allVisibleSelected={selection.allVisibleSelected}
            categories={categories}
            onToggleSelectionMode={toggleSelectionMode}
            onSelectAllVisible={selection.selectAllVisible}
            onClearSelection={clearSelection}
            onOrganize={onOrganize ?? NOOP_ORGANIZE}
            onMigrateSelected={migrateSelected}
          />
          {migrationError !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {migrationError}
            </p>
          ) : null}
          <VirtualLibraryGrid
            items={items}
            layout={viewState.layout}
            onOpenManga={onOpenManga}
            selectionMode={selection.selectionMode}
            selectedIds={selection.selectedIds}
            onToggleSelected={selection.toggleSelected}
            {...(sourceLabels === undefined ? {} : { sourceLabels })}
          />
        </>
      ) : null}
    </section>
  );
}
