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
