export { applyMigration, type MigrationApplyReport } from './apply-migration.js';
export { selectAllMatched, summarizeMigrationBatch } from './batch-migration.js';
export { MigrationPage, type MigrationPageProps } from './components/MigrationPage.js';
export {
  fetchMigrationCandidates,
  fetchMigrationHistory,
  fetchMigrationProviders,
} from './fetch-migration-page.js';
export { previewMigration } from './preview-migration.js';
export { migrationQueryKeys } from './query-keys.js';
export { rollbackMigration } from './rollback-migration.js';
export {
  migrationConfidenceBand,
  rankMigrationSearchResults,
  scoreMigrationMatch,
} from './score-migration-match.js';
export {
  searchMigrationTargets,
  type MigrationTargetSearchOutcome,
} from './search-migration-targets.js';
export {
  buildMigrationApplyReport,
  summarizeMigrationPreview,
  summarizeMigrationRollback,
} from './summarize-migration.js';
export type {
  MigrationApplyReportLine,
  MigrationApplyReportView,
  MigrationApplySummary,
  MigrationBatchSummary,
  MigrationCandidate,
  MigrationConfidenceBand,
  MigrationProviderOption,
  MigrationRollbackReportLine,
  MigrationRollbackSummary,
  MigrationSearchCandidate,
  MigrationSearchResult,
  MigrationSelectionDraft,
  MigrationTargetSearchState,
} from './types.js';

export const PACKAGE_NAME = '@app/migration' as const;
