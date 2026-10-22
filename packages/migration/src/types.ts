export interface MigrationProviderOption {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface MigrationCandidate {
  readonly mangaId: string;
  readonly canonicalTitle: string;
  readonly sourceProviderMangaId: string;
  readonly sourceMappingId: string;
  readonly isDefaultProvider: boolean;
  readonly isActiveProvider: boolean;
}

export interface MigrationSelectionDraft {
  readonly mangaId: string;
  readonly targetProviderMangaId: string;
  readonly targetProviderTitle?: string;
}

export interface MigrationSearchCandidate {
  readonly providerMangaId: string;
  readonly title: string;
}

export interface MigrationSearchResult extends MigrationSearchCandidate {
  readonly confidence: number;
}

export interface MigrationApplySummary {
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly canApply: boolean;
}

export type MigrationConfidenceBand = 'exact' | 'high' | 'medium' | 'low';

/** What one title's target search is doing right now. */
export interface MigrationTargetSearchState {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly results: readonly MigrationSearchResult[];
}

export interface MigrationBatchSummary {
  readonly totalCount: number;
  readonly selectedCount: number;
  readonly matchedCount: number;
  readonly blockedCount: number;
}

export interface MigrationApplyReportLine {
  readonly mangaId: string;
  readonly title: string;
  readonly status: 'applied' | 'skipped';
  readonly reason?: string;
}

export interface MigrationApplyReportView {
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly items: readonly MigrationApplyReportLine[];
}

export interface MigrationRollbackReportLine {
  readonly mangaId: string;
  readonly title: string;
  readonly reason: string;
}

export interface MigrationRollbackSummary {
  readonly restoredCount: number;
  readonly alreadyRestoredCount: number;
  readonly skippedCount: number;
  readonly skipped: readonly MigrationRollbackReportLine[];
}
